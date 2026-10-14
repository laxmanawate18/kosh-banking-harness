import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  BookOpen,
  Wrench,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Code2,
  Cpu,
} from 'lucide-react';
import type { ExecutionStep } from '../../types/chat';
import { useI18n } from '../../i18n';
import { DUR, EASE, SPRING, motion } from '../common/Animate';
import { humanizeCode } from '../common/Formatters';

/** "Tool Call: get_account_summary" -> "Get account summary". */
const toolName = (label: string) => humanizeCode(label.replace(/^Tool (Call|Result):\s*/i, ''));
const isTool = (step: ExecutionStep) => step.type === 'tool_call' || step.type === 'tool_result';

interface ChatProcessTraceProps {
  steps?: ExecutionStep[];
  isStreaming?: boolean;
  durationMs?: number;
}

export const ChatProcessTrace: React.FC<ChatProcessTraceProps> = ({
  steps = [],
  isStreaming = false,
  durationMs,
}) => {
  const { t } = useI18n();
  // If streaming and user hasn't toggled yet, default to open.
  // When finished streaming, keep open if there are steps or allow toggling.
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [userToggled, setUserToggled] = useState<boolean>(false);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  const [elapsedSec, setElapsedSec] = useState<number>(0);

  useEffect(() => {
    if (!isStreaming) {
      setElapsedSec(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const getProgressiveStatus = (sec: number) => {
    if (sec < 4) return t('Understanding your request…');
    if (sec < 12) return t('Consulting account records and CBS…');
    if (sec < 25) return t('Verifying banking policy and safeguards…');
    if (sec < 45) return t('Coordinating with banking services…');
    return t('Finalizing core banking response (up to 90s)…');
  };

  // When streaming finishes, if the user didn't explicitly toggle, collapse cleanly to keep chat uncluttered
  useEffect(() => {
    if (!isStreaming && !userToggled) {
      // Auto-collapse after turn completes to keep clean chat UI
      const timer = setTimeout(() => {
        setIsOpen(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, userToggled]);

  if (!steps || steps.length === 0) {
    if (isStreaming) {
      return (
        <div className="chat-trace-container">
          <div className="chat-trace-header live">
            <div className="chat-trace-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Loader2 className="trace-spinner text-brand" size={13} />
              <span>{getProgressiveStatus(elapsedSec)}</span>
              {elapsedSec >= 3 && (
                <span className="trace-dur-pill" style={{ opacity: 0.85, fontSize: '11px' }}>
                  {elapsedSec}s / 90s
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleToggleOpen = () => {
    setUserToggled(true);
    setIsOpen(prev => !prev);
  };

  const toggleDetail = (stepId: string) => {
    setExpandedDetails(prev => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  const formatDuration = (ms?: number) => {
    if (!ms && ms !== 0) return null;
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const totalDuration = durationMs ?? (
    steps.length > 0
      ? Math.max(0, steps[steps.length - 1].timestamp - steps[0].timestamp)
      : undefined
  );

  const getStepIcon = (step: ExecutionStep) => {
    if (step.status === 'running') {
      return <Loader2 className="trace-spinner" size={13} />;
    }
    switch (step.type) {
      case 'skill':
        return <BookOpen size={13} className="text-skill" />;
      case 'tool_call':
        return <Wrench size={13} className="text-tool" />;
      case 'policy':
        return <ShieldCheck size={13} className="text-policy" />;
      case 'intent':
      default:
        return <Cpu size={13} className="text-intent" />;
    }
  };

  const getStepBadgeClass = (step: ExecutionStep) => {
    switch (step.type) {
      case 'skill':
        return 'badge-skill';
      case 'tool_call':
        return 'badge-tool';
      case 'policy':
        return 'badge-policy';
      case 'intent':
      default:
        return 'badge-intent';
    }
  };

  return (
    <div className={`chat-trace-container ${isOpen ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="chat-trace-header"
        onClick={handleToggleOpen}
        aria-expanded={isOpen}
        title={isOpen ? t('Hide the steps Mitra took') : t('Show the steps Mitra took')}
      >
        <div className="chat-trace-title">
          {isStreaming ? (
            <Loader2 className="trace-spinner text-brand" size={13} />
          ) : (
            <Sparkles size={13} className="trace-sparkle" />
          )}
          <strong>{t('Steps')}</strong>
          <span className="trace-count-pill">
            {steps.length === 1 ? t('1 step') : t('{count} steps', { count: steps.length })}
          </span>
          {totalDuration != null && totalDuration > 0 && (
            <span className="trace-dur-pill">{formatDuration(totalDuration)}</span>
          )}
          {isStreaming && (
            <span className="trace-live-indicator" title={t('Signed-in requests timeout after 90 seconds')}>
              <span className="trace-live-pulse" />
              {elapsedSec > 0 ? `${elapsedSec}s · ` : ''}{t('Running')}
            </span>
          )}
        </div>
        <div className="chat-trace-action">
          <span className="trace-toggle-label">{isOpen ? t('Hide') : t('View')}</span>
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {isOpen && (
        <div className="chat-trace-body">
          <div className="chat-trace-timeline">
            {steps.map((step, idx) => {
              const hasArgs = step.args && Object.keys(step.args).length > 0;
              const hasResult = step.result !== undefined && step.result !== null;
              const hasInspector = hasArgs || hasResult;
              const isDetailOpen = !!expandedDetails[step.id];

              const tool = isTool(step);
              return (
                <motion.div
                  key={step.id || idx}
                  className={`chat-trace-step ${step.status} ${getStepBadgeClass(step)}`}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.base, ease: EASE }}
                >
                  <div className="trace-node-track">
                    <div className="trace-node-icon">
                      {getStepIcon(step)}
                    </div>
                    {idx < steps.length - 1 && <div className="trace-node-line" />}
                  </div>

                  {/* A tool call is a small chip while it runs and opens into a result card when it returns. */}
                  <motion.div layout transition={SPRING}
                    className={`trace-step-content ${tool ? (step.status === 'running' ? 'c-tool-chip' : 'c-tool-card') : ''}`}>
                    <motion.div layout="position" className="trace-step-top">
                      <span className="trace-step-label">{tool ? toolName(step.label) : step.label}</span>
                      <div className="trace-step-meta">
                        {step.duration_ms != null && step.duration_ms > 0 && (
                          <span className="trace-step-time">{formatDuration(step.duration_ms)}</span>
                        )}
                        {step.status === 'completed' && (
                          <span className="trace-step-status ok">
                            <CheckCircle2 size={11} />
                          </span>
                        )}
                        {step.status === 'running' && (
                          <span className="trace-step-status running">{t('in progress')}</span>
                        )}
                        {step.status === 'failed' && <span className="trace-step-status failed">{t('Did not finish')}</span>}
                      </div>
                    </motion.div>

                    {step.detail && !tool && (
                      <p className="trace-step-detail">{step.detail}</p>
                    )}
                    {tool && step.status === 'completed' && (
                      <motion.p className="trace-step-detail c-tool-done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}>
                        {t('Result received')}
                      </motion.p>
                    )}

                    {hasInspector && !(tool && step.status === 'running') && (
                      <div className="trace-inspector-wrap">
                        <button
                          type="button"
                          className="trace-inspector-toggle"
                          onClick={() => toggleDetail(step.id)}
                        >
                          <Code2 size={11} />
                          <span>
                            {isDetailOpen ? t('Hide details') : t('Inspect details')}
                            {hasArgs && ` ${t('({count} fields)', { count: Object.keys(step.args!).length })}`}
                          </span>
                          {isDetailOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        </button>

                        {isDetailOpen && (
                          <div className="trace-payload-viewer">
                            {hasArgs && (
                              <div className="trace-payload-section">
                                <span className="trace-payload-title">{t('Arguments:')}</span>
                                <pre>{JSON.stringify(step.args, null, 2)}</pre>
                              </div>
                            )}
                            {hasResult && (
                              <div className="trace-payload-section">
                                <span className="trace-payload-title">{t('Result:')}</span>
                                <pre>
                                  {typeof step.result === 'string'
                                    ? step.result
                                    : JSON.stringify(step.result, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
          {isStreaming && elapsedSec >= 8 && (
            <div className="trace-progressive-status" style={{ padding: '8px 14px', fontSize: '12px', color: 'var(--text-muted, #64748b)', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px dashed var(--border-color, #e2e8f0)', marginTop: '6px' }}>
              <Loader2 className="trace-spinner text-brand" size={12} />
              <span>{getProgressiveStatus(elapsedSec)}</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.8 }}>{elapsedSec}s / 90s</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
