import React, { useState, useEffect, useRef } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import type { BankingWorkflow, ServiceSchema, WorkflowFieldDefinition } from '../../types/workflows';
import {
  fetchServices,
  getWorkflow,
  saveWorkflow,
  uploadWorkflowDocument,
  deleteWorkflowDocument,
  reviewWorkflow,
  submitWorkflow,
} from '../../services/workflows';
import { completeStepUp, sendStepUpCode } from '../../services/firebaseAuth';
import { useBanking } from '../../context/BankingContext';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';

interface WorkflowModalProps {
  workflowId: string | null;
  onClose: () => void;
}

export const WorkflowModal: React.FC<WorkflowModalProps> = ({
  workflowId,
  onClose,
}) => {
  const { overview, refreshOverview } = useBanking();
  const { sendMessage } = useChat();
  const { auth, publicConfig } = useAuth();

  const [workflow, setWorkflow] = useState<BankingWorkflow | null>(null);
  const [services, setServices] = useState<ServiceSchema[]>([]);
  const [config, setConfig] = useState<{ processing_region?: string }>({});
  const [stage, setStage] = useState<'edit' | 'review' | 'complete'>('edit');

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [extractionSuccess, setExtractionSuccess] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // Review confirmation
  const [confirmed, setConfirmed] = useState<boolean>(false);

  // Document upload state
  const [docType, setDocType] = useState<string>('AADHAAR');
  const [scanConsent, setScanConsent] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);

  // Step-up authentication
  const [stepUpOpen, setStepUpOpen] = useState<boolean>(false);
  const [stepUpCode, setStepUpCode] = useState<string>('');
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [stepUpBusy, setStepUpBusy] = useState<boolean>(false);
  const [stepUpConfirmation, setStepUpConfirmation] = useState<ConfirmationResult | null>(null);

  // Load workflow and schema
  useEffect(() => {
    if (!workflowId) {
      setWorkflow(null);
      setFormData({});
      setStage('edit');
      setErrorMessage(null);
      setStatusMessage(null);
      setExtractionSuccess(null);
      setMissingFields([]);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);
    setMissingFields([]);

    Promise.all([
      fetchServices(),
      getWorkflow(workflowId),
    ])
      .then(([svcRes, wf]) => {
        if (!isMounted) return;
        setServices(svcRes.services || []);
        setConfig(svcRes.document_processing || {});
        setWorkflow(wf);
        setFormData(wf.fields || {});
        setDirty(false);
        if (wf.status !== 'DRAFT') {
          setStage('complete');
        } else {
          setStage('edit');
        }
      })
      .catch(err => {
        if (!isMounted) return;
        setErrorMessage(err.message || 'Could not load banking workflow.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workflowId]);

  if (!workflowId) return null;

  const schema = services.find(s => s.id === workflow?.skill_id);
  const isDone = workflow?.status !== 'DRAFT';

  // Helper options for account or beneficiary
  const getFieldOptions = (f: WorkflowFieldDefinition): [string, string][] => {
    if (f.kind === 'account') {
      const accs = overview?.accounts || [];
      return accs
        .filter(a => a.status === 'ACTIVE' || !a.status)
        .map(a => [a.id, `${a.name || 'Account'} · ${a.account_number_masked || a.account_number}`]);
    }
    if (f.kind === 'beneficiary') {
      const benes = overview?.beneficiaries || [];
      return benes
        .filter(b => b.status === 'ACTIVE' || !b.status)
        .map(b => [b.id, b.name || (b as any).display_name || 'Beneficiary']);
    }
    return f.choices || [];
  };

  // Fields the customer edited since the last save. Mitra can update the draft in the background
  // (document prefill), so saves send only these and always target the latest server revision.
  const editedKeys = useRef<Set<string>>(new Set());

  const handleFieldChange = (key: string, val: string) => {
    setFormData(prev => ({ ...prev, [key]: val }));
    editedKeys.current.add(key);
    setDirty(true);
    setErrorMessage(null);
    setMissingFields(prev => prev.filter(k => k !== key));
  };

  // Save current form state to server
  const saveDraft = async (dataToSave = formData): Promise<BankingWorkflow | null> => {
    if (!workflow) return null;
    const latest = await getWorkflow(workflow.id);
    const changes: Record<string, string> = {};
    for (const k of editedKeys.current) {
      if ((dataToSave[k] ?? '') !== (latest.fields?.[k] || '')) changes[k] = dataToSave[k] ?? '';
    }
    const updated = Object.keys(changes).length ? await saveWorkflow(latest.id, latest.revision, changes) : latest;
    editedKeys.current.clear();
    setWorkflow(updated);
    setFormData(updated.fields || {});
    setDirty(false);
    return updated;
  };

  // Close handler: saves if dirty then closes
  const handleClose = async () => {
    try {
      if (dirty && workflow && workflow.status === 'DRAFT') {
        await saveDraft();
      }
    } catch {
      // ignore auto-save on close error
    }
    onClose();
  };

  // Stage transitions
  const handleGoToReview = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!workflow) return;
    setSaving(true);
    setErrorMessage(null);
    setMissingFields([]);

    try {
      // Check required fields according to schema
      const missing: string[] = [];
      if (schema?.fields) {
        for (const f of schema.fields) {
          const isVisible = checkFieldVisible(f.key);
          if (f.required && isVisible && !formData[f.key]?.trim()) {
            missing.push(f.key);
          }
        }
      }

      if (missing.length > 0) {
        setMissingFields(missing);
        const firstMissing = schema?.fields?.find(f => f.key === missing[0]);
        throw new Error(`Please complete required field: "${firstMissing?.label || missing[0]}" before proceeding.`);
      }

      const savedWf = await saveDraft();
      const rev = savedWf?.revision ?? workflow.revision;
      const reviewed = await reviewWorkflow(workflow.id, rev, {});
      setWorkflow(reviewed);
      setStage('review');
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not proceed to review.');
      if (err.detail?.checks) {
        setWorkflow(prev => (prev ? { ...prev, checks: err.detail.checks } : prev));
      }
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  // AI Extraction trigger & live polling loop
  const triggerMitraPrefill = async (targetWorkflow?: BankingWorkflow) => {
    const wf = targetWorkflow || workflow;
    if (!wf) return;

    setIsExtracting(true);
    setErrorMessage(null);
    setExtractionSuccess(null);
    setStatusMessage('Mitra is analyzing your document and prefilling form fields…');

    try {
      // Send the background extraction instruction to Mitra. If Mitra is still reading the previous
      // document, sendMessage refuses (returns false); wait for the turn to finish instead of dropping it.
      const prompt = 'Read the document evidence for my open banking workflow and prefill only the fields that are clearly visible. Leave uncertain fields blank.';
      const sendDeadline = Date.now() + 90_000;
      while (!(await sendMessage(prompt, wf.id))) {
        if (Date.now() > sendDeadline) throw new Error('Mitra is busy. Use "Prefill with Mitra" again in a moment.');
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const initialRev = (await getWorkflow(wf.id)).revision;
      const initialFieldCount = Object.keys(wf.fields || {}).length;
      let attempts = 0;

      const pollInterval = setInterval(async () => {
        attempts += 1;
        try {
          const fresh = await getWorkflow(wf.id);
          const freshFieldCount = Object.keys(fresh.fields || {}).length;
          const revBumped = fresh.revision > initialRev;
          const hasDocAi = fresh.sources && Object.values(fresh.sources).some(
            s => s === 'DOCUMENT_AI_SUGGESTION' || s === 'DOCUMENT_OCR'
          );

          if (revBumped || attempts >= 15) {
            clearInterval(pollInterval);
            setIsExtracting(false);

            if (hasDocAi || revBumped || freshFieldCount > initialFieldCount) {
              setWorkflow(fresh);
              setFormData(prev => {
                const merged = { ...prev, ...(fresh.fields || {}) };
                for (const k of editedKeys.current) merged[k] = prev[k];  // customer edits win
                return merged;
              });
              setDirty(false);
              setMissingFields([]);

              const extractedKeys = Object.keys(fresh.fields || {}).filter(
                k => fresh.sources?.[k] === 'DOCUMENT_AI_SUGGESTION' || fresh.sources?.[k] === 'DOCUMENT_OCR'
              );
              const count = extractedKeys.length;
              setExtractionSuccess(
                count > 0
                  ? `✓ Mitra extracted ${count} field${count > 1 ? 's' : ''} from your document (${extractedKeys.join(', ')}). Please review the prefilled values below.`
                  : '✓ Document analyzed. Please complete any remaining declarations below.'
              );
              setStatusMessage(null);
              modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              setStatusMessage('Extraction request completed. You can continue filling any remaining fields manually.');
            }
          }
        } catch {
          if (attempts >= 15) {
            clearInterval(pollInterval);
            setIsExtracting(false);
          }
        }
      }, 1000);
    } catch (err: any) {
      setIsExtracting(false);
      setErrorMessage(err.message || 'Could not trigger Mitra prefill.');
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleDocumentUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setErrorMessage('Please select a document file (JPG, PNG or PDF under 8 MB).');
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!scanConsent) {
      setErrorMessage('Please allow document processing by checking the permission box.');
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage('Document file must be smaller than 8 MB.');
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!workflow) return;

    setSaving(true);
    setStatusMessage('Reading document with Google Cloud OCR…');
    setErrorMessage(null);
    setExtractionSuccess(null);

    try {
      const savedWf = await saveDraft();
      const currentRev = savedWf?.revision ?? workflow.revision;

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const updated = await uploadWorkflowDocument(workflow.id, {
        revision: currentRev,
        document_type: docType,
        name: file.name,
        mime_type: file.type,
        data_base64: base64Data,
        consent: true,
      });

      setWorkflow(updated);
      setFormData(prev => ({ ...prev, ...(updated.fields || {}) }));
      setStatusMessage('Document uploaded and scanned successfully.');
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Auto-prefill if text was extracted from document
      if (updated.documents?.some(d => d.scan_status === 'TEXT_EXTRACTED')) {
        await triggerMitraPrefill(updated);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Document upload failed.');
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDocument = async (docId: string) => {
    if (!workflow) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await saveDraft();
      const updated = await deleteWorkflowDocument(workflow.id, docId);
      setWorkflow(updated);
      setFormData(updated.fields || {});
      setStatusMessage('Document removed from draft.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not remove document.');
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const executeSubmit = async () => {
    if (!workflow) return;
    if (!confirmed) {
      setErrorMessage('Please confirm that you have reviewed the details before submitting.');
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    setErrorMessage(null);

    try {
      const latest = await getWorkflow(workflow.id);
      const updated = await submitWorkflow(workflow.id, {
        revision: latest.revision,
        review_digest: workflow.review_digest || '',
        confirmed: true,
      });
      setWorkflow(updated);
      setStage('complete');
      await refreshOverview();
    } catch (err: any) {
      if (err.detail?.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        setStepUpOpen(true);
        setStepUpError(null);
      } else {
        setErrorMessage(err.message || 'Workflow submission failed.');
        modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStepUpVerify = async () => {
    if (!stepUpCode.trim()) {
      setStepUpError('Please enter the 6-digit verification code.');
      return;
    }
    setStepUpBusy(true);
    setStepUpError(null);
    try {
      if (!stepUpConfirmation) {
        throw new Error('Send a fresh Firebase verification code first.');
      }
      await completeStepUp(stepUpConfirmation, stepUpCode);
      setStepUpOpen(false);
      setStepUpConfirmation(null);
      // Retry submission with elevated L3 assurance
      await executeSubmit();
    } catch (err: any) {
      setStepUpError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setStepUpBusy(false);
    }
  };

  const handleSendStepUpOtp = async () => {
    if (!publicConfig?.firebase_api_key || !auth?.user?.phone_number) {
      setStepUpError('Firebase step-up is not configured for this account.');
      return;
    }
    setStepUpBusy(true);
    setStepUpError(null);
    try {
      const sent = await sendStepUpCode(auth.user.phone_number, publicConfig, 'step-up-recaptcha');
      setStepUpConfirmation(sent.confirmation);
      setStepUpCode(sent.prefill);
    } catch (err: any) {
      setStepUpError(err.message || 'Could not send a fresh Firebase verification code.');
    } finally {
      setStepUpBusy(false);
    }
  };

  const handleDownloadStatement = async () => {
    if (!workflow?.download) return;
    try {
      const res = await fetch(workflow.download, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = workflow.skill_id === 'certificate' ? 'kosh-certificate.csv' : 'kosh-statement.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setErrorMessage(e.message || 'Could not download statement.');
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Conditional visibility rules matching workflows.js
  const checkFieldVisible = (key: string): boolean => {
    const hasPanRoute = schema?.fields?.some(f => f.key === 'pan_route');
    if (key === 'pan_number') return hasPanRoute ? formData.pan_route === 'PAN' : true;
    if (key === 'form60_reason') return formData.pan_route === 'FORM_60';
    if (key === 'pep_details') return formData.pep_status === 'YES';
    if (key === 'foreign_tax_details') return ['MULTIPLE_COUNTRIES', 'OUTSIDE_INDIA'].includes(formData.tax_residency || '');
    if (key === 'document_expiry') return ['PASSPORT', 'DRIVING_LICENSE'].includes(formData.identity_document || '');
    return true;
  };

  const sections = Array.from(new Set(schema?.fields?.map(f => f.section || 'Details') || []));

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[3px] z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`workflow-dialog relative flex flex-col overflow-hidden max-h-[92vh] w-full max-w-[1050px] ${
          saving ? 'wf-busy' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={workflow?.name || 'Banking service workflow'}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="wf-header">
          <div>
            <span className="eyebrow" style={{ fontSize: '10px', letterSpacing: '0.08em', color: '#25614b', fontWeight: 700 }}>
              MITRA · KOSH BANKING WORKFLOW
            </span>
            <h2>{workflow?.name || 'Banking Workflow'}</h2>
            <p>{schema?.description || 'Complete the verified fields below.'}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close workflow"
            onClick={handleClose}
            style={{ fontSize: '24px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#66746c' }}
          >
            ×
          </button>
        </header>

        {/* Body */}
        <div ref={modalBodyRef} className="wf-body flex-1 overflow-y-auto">
          <div className="wf-main">
            {/* Progress Stepper */}
            <div className="wf-progress">
              <span className={!isDone && stage === 'edit' ? 'current' : ''}>1. Prepare</span>
              <span className={!isDone && stage === 'review' ? 'current' : ''}>2. Review</span>
              <span className={isDone ? 'current' : ''}>3. Submit & track</span>
            </div>

            {/* Prominent Notifications Banner (Always Visible at Top of Modal) */}
            {errorMessage && (
              <div className="wf-alert-box error" role="alert">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>⚠️</span>
                  <div>
                    <strong>Action Required:</strong> {errorMessage}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  style={{ background: 'none', border: 'none', color: '#9b1c1c', cursor: 'pointer', fontSize: '14px' }}
                >
                  ✕
                </button>
              </div>
            )}

            {isExtracting && (
              <div className="wf-extracting-banner">
                <div className="wf-extracting-pulse" />
                <span>Mitra is reading your document evidence and prefilling form fields in real-time…</span>
              </div>
            )}

            {statusMessage && !isExtracting && (
              <div className="wf-alert-box info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="inline-block w-2 h-2 rounded-full bg-[#006b5e] animate-pulse" />
                  <span>{statusMessage}</span>
                </div>
              </div>
            )}

            {extractionSuccess && (
              <div className="wf-alert-box success">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>🎉</span>
                  <span>{extractionSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExtractionSuccess(null)}
                  style={{ background: 'none', border: 'none', color: '#0e6245', cursor: 'pointer', fontSize: '14px' }}
                >
                  ✕
                </button>
              </div>
            )}

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#66746c' }}>
                <p>Loading workflow dossier…</p>
              </div>
            ) : isDone ? (
              /* Stage 3: Completed / Submitted */
              <div className="wf-receipt">
                <span className="badge neutral" style={{ display: 'inline-block', marginBottom: '12px' }}>
                  {workflow?.status === 'COMPLETED' ? (workflow?.fulfilment_summary ? 'Done instantly' : 'Ready to download') : 'Submitted for review'}
                </span>
                <h3>{workflow?.status === 'COMPLETED'
                  ? (workflow?.fulfilment_summary ? 'Done. No branch visit or wait needed.' : 'Your statement is ready.')
                  : 'Your request is with the bank.'}</h3>
                <p style={{ marginTop: '8px', lineHeight: 1.6 }}>{workflow?.fulfilment_summary || workflow?.outcome}.</p>

                {workflow?.request_id && (
                  <div className="wf-review-row" style={{ marginTop: '16px' }}>
                    <span>Request reference</span>
                    <strong style={{ letterSpacing: '0.5px' }}>{workflow.request_id}</strong>
                  </div>
                )}

                <p className="form-hint" style={{ fontSize: '11px', color: '#66746c', marginTop: '14px' }}>
                  {workflow?.status === 'COMPLETED'
                    ? (workflow?.fulfilment_summary ? 'Processed automatically and recorded in My requests. An SMS confirmation is on its way.'
                      : 'Generated securely from your recorded bank account transactions.')
                    : 'Track updates in Your Requests. The bank may verify supporting evidence before finalizing the service.'}
                </p>

                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                  {workflow?.download ? (
                    <button type="button" className="button primary" onClick={handleDownloadStatement}>
                      {workflow?.skill_id === 'certificate' ? 'Download certificate ↗' : 'Download statement ↗'}
                    </button>
                  ) : null}
                  <button type="button" className="button" onClick={onClose}>
                    Close
                  </button>
                </div>
              </div>
            ) : stage === 'edit' ? (
              /* Stage 1: Prepare (Edit & Documents) */
              <>
                {/* Documents Upload Section */}
                {schema?.documents && (
                  <section className="wf-upload">
                    <h3>Read details from your documents</h3>
                    <p>
                      Upload a clear scan or photo. We’ll read it with Google Cloud and suggest fields for you to review.
                      PAN is not address proof. Use a masked Aadhaar copy, or choose another official identity document.
                    </p>

                    <div className="wf-upload-controls">
                      <label>
                        Document type
                        <select value={docType} onChange={e => setDocType(e.target.value)}>
                          {['AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LICENSE', 'FORM_60', 'NREGA_JOB_CARD', 'NPR_LETTER'].map(d => (
                            <option key={d} value={d}>
                              {d.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Choose file
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/jpeg,image/png,application/pdf"
                        />
                      </label>
                    </div>

                    <label className="wf-permission">
                      <input
                        type="checkbox"
                        checked={scanConsent}
                        onChange={e => setScanConsent(e.target.checked)}
                      />
                      <span>
                        I allow this document to be processed by Google Cloud ({config.processing_region || 'asia-south1'}) and Mitra to extract information for this banking request.
                      </span>
                    </label>

                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        className="button primary"
                        disabled={saving || isExtracting}
                        onClick={handleDocumentUpload}
                      >
                        {saving ? 'Uploading & scanning…' : 'Scan & prefill'}
                      </button>
                      <p style={{ margin: 0, fontSize: '11px', color: '#647369' }}>
                        JPEG, PNG or PDF · up to 8 MB · PDFs up to 5 pages.
                      </p>
                    </div>

                    {/* Uploaded Documents List */}
                    {workflow?.documents && workflow.documents.length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        {workflow.documents.map(d => (
                          <div key={d.id} className="wf-document">
                            <div className="wf-document-head">
                              <strong>{d.document_type.replace(/_/g, ' ')}</strong>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => handleRemoveDocument(d.id)}
                                style={{ fontSize: '11px', color: '#a84437' }}
                              >
                                Remove
                              </button>
                            </div>
                            <small>
                              {d.scan_status === 'TEXT_EXTRACTED'
                                ? 'Text read by Google Cloud'
                                : d.scan_status === 'NO_TEXT_FOUND'
                                ? 'No readable text found'
                                : 'Cloud scan unavailable'}
                              {d.quality_score != null ? ` · OCR score ${Math.round(d.quality_score * 100)}%` : ''} · authenticity pending bank review
                            </small>
                            {d.message && <small>{d.message}</small>}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Prefill with Mitra */}
                {workflow?.documents?.some(d => d.scan_status === 'TEXT_EXTRACTED') && (
                  <div className="wf-help" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <strong>AI Document Interpretation</strong>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#66746c' }}>
                        Let Mitra interpret the document scan and automatically prefill names, dates, document numbers and address.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button primary"
                      disabled={isExtracting || saving}
                      onClick={() => triggerMitraPrefill()}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {isExtracting ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="inline-block w-2 h-2 rounded-full bg-white animate-ping" />
                          Extracting…
                        </span>
                      ) : (
                        'Prefill with Mitra ↗'
                      )}
                    </button>
                  </div>
                )}

                {/* Form Fields by Section */}
                <form id="workflowFields" onSubmit={handleGoToReview}>
                  {sections.map(sectionName => {
                    const sectionFields = (schema?.fields || []).filter(
                      f => (f.section || 'Details') === sectionName
                    );

                    return (
                      <fieldset key={sectionName} className="wf-section">
                        <legend>{sectionName}</legend>
                        <div className="wf-fields">
                          {sectionFields.map(f => {
                            const isVisible = checkFieldVisible(f.key);
                            if (!isVisible) return null;

                            const value = formData[f.key] || '';
                            const source = workflow?.sources?.[f.key];
                            const isWide = f.kind === 'textarea';
                            const isInvalid = missingFields.includes(f.key);

                            return (
                              <label
                                key={f.key}
                                className={isWide ? 'wf-wide' : ''}
                              >
                                <span style={{ color: isInvalid ? '#d32f2f' : undefined }}>
                                  {f.label}{' '}
                                  {!f.required ? (
                                    <span className="wf-optional">If applicable</span>
                                  ) : isInvalid ? (
                                    <span style={{ color: '#d32f2f', fontWeight: 600 }}>* Required</span>
                                  ) : null}
                                </span>

                                {['select', 'account', 'beneficiary'].includes(f.kind) ? (
                                  <select
                                    name={f.key}
                                    value={value}
                                    required={f.required}
                                    className={isInvalid ? 'wf-field-invalid' : ''}
                                    onChange={e => handleFieldChange(f.key, e.target.value)}
                                  >
                                    <option value="">Choose an option</option>
                                    {getFieldOptions(f).map(([v, l]) => (
                                      <option key={v} value={v}>
                                        {l}
                                      </option>
                                    ))}
                                  </select>
                                ) : f.kind === 'textarea' ? (
                                  <textarea
                                    name={f.key}
                                    value={value}
                                    required={f.required}
                                    maxLength={1200}
                                    rows={2}
                                    className={isInvalid ? 'wf-field-invalid' : ''}
                                    onChange={e => handleFieldChange(f.key, e.target.value)}
                                  />
                                ) : (
                                  <input
                                    name={f.key}
                                    type={f.kind === 'date' ? 'date' : 'text'}
                                    inputMode={f.kind === 'money' ? 'decimal' : undefined}
                                    value={value}
                                    required={f.required}
                                    maxLength={f.key === 'document_last4' ? 4 : 160}
                                    pattern={f.pattern}
                                    autoComplete="off"
                                    className={isInvalid ? 'wf-field-invalid' : ''}
                                    onChange={e => handleFieldChange(f.key, e.target.value)}
                                  />
                                )}

                                {source && (
                                  <small className="wf-source">
                                    {source === 'CUSTOMER_CONFIRMED'
                                      ? 'Reviewed by you'
                                      : source === 'BANK_PROFILE'
                                      ? 'From your bank profile'
                                      : 'Read from your document · review this value'}
                                  </small>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    );
                  })}
                </form>
              </>
            ) : (
              /* Stage 2: Review */
              <div>
                <div className="wf-status">
                  Review these details carefully. {workflow?.outcome}.{' '}
                  {schema?.level === 'L3' && 'You’ll verify your identity before submission.'}
                </div>

                <div style={{ marginBottom: '20px' }}>
                  {schema?.fields
                    ?.filter(f => formData[f.key])
                    .map(f => {
                      const v = formData[f.key];
                      const opts = getFieldOptions(f);
                      const displayVal = opts.find(o => o[0] === v)?.[1] || v;

                      return (
                        <div key={f.key} className="wf-review-row">
                          <span>{f.label}</span>
                          <strong>{f.key === 'pan_number' ? '••••••' + v.slice(-4) : displayVal}</strong>
                        </div>
                      );
                    })}
                </div>

                <label className="wf-permission">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={e => setConfirmed(e.target.checked)}
                  />
                  <span>
                    I have reviewed the information and confirm it is accurate. I authorize the bank to process this request.
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Aside: Application Checks */}
          <aside className="wf-side">
            <h3>Application checks</h3>
            {workflow?.checks && workflow.checks.length > 0 ? (
              workflow.checks.map((c, idx) => (
                <div
                  key={idx}
                  className={`wf-check ${
                    c.status === 'PASS' ? 'pass' : c.blocking ? 'action' : 'review'
                  }`}
                >
                  <span>{c.status === 'PASS' ? '✓ CHECKED' : c.blocking ? 'TO COMPLETE' : 'BANK REVIEW'}</span>
                  {c.message}
                </div>
              ))
            ) : (
              <p className="muted" style={{ fontSize: '11px' }}>
                All validation checks clear.
              </p>
            )}
          </aside>
        </div>

        {/* Footer */}
        <footer className="wf-footer">
          <span className="wf-save-status" role="status" style={{ marginRight: 'auto', alignSelf: 'center', fontSize: '12px', color: '#66746c' }}>
            {dirty ? 'Unsaved changes' : isExtracting ? 'Extracting details…' : 'Draft progress saved'}
          </span>

          {isDone ? (
            <button type="button" className="button" onClick={onClose}>
              Close
            </button>
          ) : stage === 'review' ? (
            <>
              <button
                type="button"
                className="button"
                onClick={() => setStage('edit')}
                disabled={saving}
              >
                Edit details
              </button>
              <button
                type="button"
                className="button primary"
                onClick={executeSubmit}
                disabled={saving || !confirmed}
              >
                {saving ? 'Submitting…' : 'Confirm & submit'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="button"
                onClick={handleClose}
                disabled={saving || isExtracting}
              >
                Save & close
              </button>
              <button
                type="button"
                className="button primary"
                onClick={handleGoToReview}
                disabled={saving || isExtracting}
              >
                Review details ↗
              </button>
            </>
          )}
        </footer>

        {/* Step-Up OTP Modal */}
        {stepUpOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4"
            onClick={e => {
              if (e.target === e.currentTarget) setStepUpOpen(false);
            }}
          >
            <div
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-[#dce3dc]"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-base font-bold mb-1" style={{ color: '#1b3028' }}>Step-Up Authorization Required</h3>
              <p className="text-xs text-[#66746c] mb-4">
                This action requires a fresh Firebase phone verification. L3 lasts for five minutes.
              </p>

              <div id="step-up-recaptcha" />
              {!stepUpConfirmation && (
                <button type="button" className="button primary wide" onClick={handleSendStepUpOtp} disabled={stepUpBusy}>
                  {stepUpBusy ? 'Sending…' : 'Send fresh verification code'}
                </button>
              )}

              {stepUpError && (
                <div className="p-2.5 bg-[#fdf2f2] border border-[#f8b4b4] rounded-lg text-xs text-[#9b1c1c] mb-3">
                  {stepUpError}
                </div>
              )}

              {stepUpConfirmation && <label className="block text-xs font-semibold mb-2" style={{ color: '#1b3028' }}>
                One-Time Password (OTP)
                <input
                  type="text"
                  maxLength={6}
                  value={stepUpCode}
                  onChange={e => setStepUpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full mt-1 px-3 py-2 border border-[#d9e2da] rounded-lg font-mono text-center text-lg tracking-widest"
                  placeholder="6-digit code"
                  autoFocus
                />
              </label>}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="button"
                  onClick={() => setStepUpOpen(false)}
                  disabled={stepUpBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={handleStepUpVerify}
                  disabled={stepUpBusy || !stepUpCode || !stepUpConfirmation}
                >
                  {stepUpBusy ? 'Verifying…' : 'Verify & authorize'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
