import React, { useState } from 'react';
import { Product, ProductApplyResponse, CrossSellOffer } from '../../types/products';
import { applyForProduct, fetchProducts } from '../../services/products';
import { Modal } from '../common/Modal';
import { AccountApplication } from '../applications/AccountApplication';
import { monthlyEmi } from '../common/Formatters';
import { EASE, motion } from '../common/Animate';
import { useReducedMotion } from 'framer-motion';
import {
  CheckCircle2,
  Copy,
  ShieldCheck,
  ArrowRight,
  CreditCard,
  Coins,
  Sparkles,
  Building2,
  Check,
  Clock,
  Info,
} from 'lucide-react';

interface InstantOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

/** Callers pass key={product?.id}, so a new product (or a reopen) starts with fresh state. */
export const InstantOnboardingModal: React.FC<InstantOnboardingModalProps> = ({
  isOpen,
  onClose,
  product: initialProduct,
}) => {
  const [currentProduct, setCurrentProduct] = useState<Product | null>(initialProduct);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [employmentType, setEmploymentType] = useState('Salaried');
  const [employerOrCollege, setEmployerOrCollege] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('85000');
  const [pincode, setPincode] = useState('400001');

  // Loan Specific Fields
  const [loanAmount, setLoanAmount] = useState('500000');
  const [loanTenure, setLoanTenure] = useState('36');
  const [loanPurpose, setLoanPurpose] = useState('Home Renovation & Living');

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProductApplyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const product = currentProduct;
  if (!product) return null;
  // Savings accounts and fixed deposits go through the account-opening pipeline (KYC, officer review, the core banking
  // robot); cards and loans keep this form.
  if (product.category === 'savings' || product.category === 'deposits') {
    return isOpen ? <AccountApplication product={product} onClose={onClose} /> : null;
  }

  const category = (product.category || '').toLowerCase();
  const isCard = category === 'cards';
  const isLoan = category === 'loans';
  const isAccount = !isCard && !isLoan;

  // Live loan EMI estimate
  let calculatedEmi = 0;
  if (isLoan) {
    const p = parseFloat(loanAmount) || 0;
    const rateMatch = (product.headline_rate || '').match(/(\d+(\.\d+)?)/);
    if (p > 0) calculatedEmi = Math.round(monthlyEmi(p, rateMatch ? parseFloat(rateMatch[1]) : 10.25, parseInt(loanTenure, 10) || 36));
  }

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await applyForProduct({
        product_id: product.id,
        full_name: fullName,
        phone_number: phone,
        email,
        pan_number: panNumber.toUpperCase(),
        employment_type: employmentType,
        employer_or_college: employerOrCollege,
        monthly_income: parseFloat(monthlyIncome) || 0,
        pincode,
        loan_amount: isLoan ? parseFloat(loanAmount) || 500000 : undefined,
        loan_tenure_months: isLoan ? parseInt(loanTenure, 10) || 36 : undefined,
        loan_purpose: isLoan ? loanPurpose : undefined,
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Application processing failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSecureSignIn = () => {
    window.location.assign('/api/auth/start?return_to=/');
  };

  const handleSwitchToCrossSell = async (productId: string) => {
    try {
      setIsLoading(true);
      const data = await fetchProducts();
      const targetProd = data.products.find(p => p.id === productId);
      if (targetProd) {
        setCurrentProduct(targetProd);
        setResult(null);
        setError('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine Modal Title & Subtitle
  let modalTitle = `Review ${product.title}`;
  let modalSubtitle = 'Review details and submit your application in this trusted environment.';

  if (result) {
    if (result.status === 'PENDING_APPROVAL') {
      modalTitle = 'Application Under Officer Review';
      modalSubtitle = 'Application received. Credentials will be delivered to your registered email upon approval.';
    } else if (result.application_type === 'credit_card') {
      modalTitle = 'Credit Card Application Submitted';
      modalSubtitle = 'Your application has been soft-approved. No bank account creation required.';
    } else if (result.application_type === 'loan') {
      modalTitle = 'Loan In-Principle Sanction Issued';
      modalSubtitle = 'Instant soft approval. Funds can disburse to any existing bank account.';
    } else {
      modalTitle = 'Banking Profile Created';
      modalSubtitle = 'Identity access is managed only through Kosh Secure Sign-In.';
    }
  } else {
    if (isCard) {
      modalTitle = `Apply for ${product.title}`;
      modalSubtitle = 'Standalone credit card application · No Kosh bank account required';
    } else if (isLoan) {
      modalTitle = `Apply for ${product.title}`;
      modalSubtitle = 'Instant paperless loan sanction · Funds disbursed into ANY existing bank account';
    }
  }

  const resultProps = { onCopy: handleCopy, onCrossSell: handleSwitchToCrossSell, onDone: onClose };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} subtitle={modalSubtitle}>
      {/* Present from the start, so the success line is announced (politely) the moment it arrives. */}
      <p className="sr-only" role="status">{result ? `${modalTitle}. ${modalSubtitle}` : ''}</p>
      {result && <LotusBloom />}
      {error && <div className="iob-error">{error}</div>}

      {result && result.application_type === 'credit_card' && (
        <ResultView
          {...resultProps} result={result}
          title="In-Principle Sanction Approved"
          tag="Standalone Card"
          intro={<>Your application for the <strong>{result.card_title || product.title}</strong> has been received. Zero bank account opening required.</>}
          refLabel="Application Reference:"
          rows={[
            ['Pre-Approved Credit Limit:', <strong className="iob-big">{result.credit_limit || '₹1,50,000'}</strong>],
            ['Applicant Name:', <span className="iob-semi">{result.applicant_name}</span>],
            ['PAN Masked:', <span className="iob-ink iob-mono">{result.pan_masked}</span>],
            ['Status:', <span className="iob-status"><Check size={14} /> Soft-Sanction Active</span>],
          ]}
          nextTitle="Next Steps & Delivery:"
          nextText={result.next_steps || 'Our underwriting team will verify your digital video-KYC and PAN. A tracking SMS has been sent to your mobile. Physical metal card will be delivered to your PIN code.'}
          crossSell={['Optional Banking Privilege', 'Explore Sovereign Account & 500 Pts']}
        />
      )}

      {result && result.application_type === 'loan' && (
        <ResultView
          {...resultProps} result={result}
          title="In-Principle Soft Sanction Issued"
          tag="Paperless Disbursal"
          intro={<>Your loan request for <strong>{result.loan_title || product.title}</strong> is pre-approved. Disbursement can be sent directly to <strong>ANY bank account</strong> you hold.</>}
          refLabel="Loan Reference ID:"
          rows={[
            ['Sanctioned Amount:', <strong className="iob-big">{result.loan_amount}</strong>],
            ['Estimated EMI:', <strong className="iob-big green">{result.estimated_emi}</strong>],
            ['Tenure & Rate:', <span className="iob-semi">{result.tenure_months} Months @ {result.headline_rate}</span>],
            ['Applicant:', <span className="iob-ink">{result.applicant_name} ({result.pan_masked})</span>],
          ]}
          nextTitle="Next Steps:"
          nextText={result.next_steps}
          crossSell={['Priority Disbursal Perk', 'Open Sovereign Account (Zero Fee Disbursal)']}
        />
      )}

      {result && result.status === 'PENDING_APPROVAL' && (
        <ResultView
          {...resultProps} result={result}
          pending
          title="Application Under Officer Review"
          tag="Pending Approval"
          intro={<>Your application for <strong>{result.product?.title || product.title}</strong> has been received by Kosh Banking Operations.</>}
          refLabel="Application Reference:"
          rows={[
            ['Applicant Name:', <span className="iob-semi">{result.applicant_name}</span>],
            ['Registered Email:', <strong className="iob-email">{result.email}</strong>],
            ['Mobile Verification:', <span className="iob-ink iob-mono">{result.phone_number}</span>],
          ]}
          nextTitle="Next Steps:"
          nextText={result.next_steps || `A Bank Operations Officer will review and approve your application. Upon approval, your digital banking credentials and temporary login password will be dispatched to ${result.email}.`}
        />
      )}

      {/* Savings / demo account result (legacy profile) */}
      {result && result.status !== 'PENDING_APPROVAL' && result.application_type === 'savings_account' && result.profile && (
        <div className="iob-stack">
          <div className="iob-card iob-banner">
            <CheckCircle2 size={20} />
            <div>
              <h4>Simulated Account Ready</h4>
              <p className="tight">
                Demo account <strong className="iob-mono">{result.account?.account_number}</strong> was created locally.
              </p>
            </div>
          </div>

          <div className="iob-card iob-table roomy">
            <div className="iob-row">
              <span>Customer Name:</span>
              <strong className="iob-semi">{result.profile.display_name}</strong>
            </div>
            <div className="iob-row">
              <span>Customer ID:</span>
              <strong className="iob-ink iob-mono">{result.profile.customer_id}</strong>
            </div>
            <div className="iob-row">
              <span>Mobile:</span>
              <strong className="iob-chip">{result.profile.phone_number}</strong>
            </div>
            <div className="iob-row">
              <span>Authentication:</span>
              <strong className="iob-green">Kosh Secure Sign-In</strong>
            </div>
          </div>

          <div className="iob-pair">
            <button
              onClick={() => handleCopy(`Kosh profile ${result.profile?.customer_id}\nAccount: ${result.account?.account_number}`)}
              className="iob-copy mf-transition"
            >
              <Copy size={16} /> {copied ? 'Copied!' : 'Copy reference'}
            </button>
            <button onClick={handleSecureSignIn} className="iob-signin mf-transition">
              Continue to Secure Sign-In <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Application form (cards, loans, or savings) */}
      {!result && (
        <form onSubmit={handleApply} className="iob-stack">
          <div className="iob-card iob-product">
            <div className="iob-product-id">
              <div className="iob-product-icon">
                {isCard ? <CreditCard size={20} /> : isLoan ? <Coins size={20} /> : <Building2 size={20} />}
              </div>
              <div>
                <h4>{product.title}</h4>
                <p>{product.category_label || product.category.toUpperCase()}</p>
              </div>
            </div>
            <div className="iob-product-rate">
              <span>{product.headline_rate}</span>
            </div>
          </div>

          <div className="iob-grid">
            <Field label="Full Legal Name (as on PAN)">
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Vikram Singhania" required />
            </Field>

            <Field label="Mobile Number">
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" required />
            </Field>

            <Field label="Email Address">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vikram@example.com" required />
            </Field>

            <Field label="Permanent Account Number (PAN)">
              <input
                type="text"
                value={panNumber}
                onChange={e => setPanNumber(e.target.value.toUpperCase())}
                placeholder="e.g. ABCDE1234F"
                maxLength={10}
                required={isCard || isLoan}
                className="iob-pan"
              />
            </Field>

            {(isCard || isLoan) && (
              <>
                <Field label="Employment / Persona">
                  <select value={employmentType} onChange={e => setEmploymentType(e.target.value)}>
                    <option value="Salaried">Salaried Professional</option>
                    <option value="Self-Employed">Self-Employed / Business Owner</option>
                    <option value="Student">College / University Student</option>
                    <option value="Freelancer">Freelancer / Consultant</option>
                  </select>
                </Field>

                <Field label={employmentType === 'Student' ? 'Monthly Allowance / Stipend (₹)' : 'Monthly Net In-Hand Income (₹)'}>
                  <input type="number" value={monthlyIncome} onChange={e => setMonthlyIncome(e.target.value)} placeholder="85000" required />
                </Field>

                <Field label={employmentType === 'Student' ? 'University / College Name' : 'Company / Employer Name'}>
                  <input
                    type="text"
                    value={employerOrCollege}
                    onChange={e => setEmployerOrCollege(e.target.value)}
                    placeholder={employmentType === 'Student' ? 'e.g. IIT Bombay' : 'e.g. Tata Consultancy Services'}
                  />
                </Field>
              </>
            )}

            <Field label="Current Residential PIN Code">
              <input type="text" value={pincode} onChange={e => setPincode(e.target.value)} placeholder="400001" maxLength={6} required />
            </Field>
          </div>

          {isLoan && (
            <div className="iob-card iob-loan">
              <div className="iob-loan-head">
                <span><Coins size={16} /> Loan Amount & Tenure Configurator</span>
                <span>Live Estimate</span>
              </div>

              <div className="iob-grid loan">
                <Field loan label="Required Loan Amount (₹)">
                  <input
                    type="number"
                    value={loanAmount}
                    onChange={e => setLoanAmount(e.target.value)}
                    min={50000}
                    step={25000}
                    className="is-strong"
                  />
                  <div className="iob-amounts">
                    {['200000', '500000', '1000000'].map(amt => (
                      <button key={amt} type="button" onClick={() => setLoanAmount(amt)} className={loanAmount === amt ? 'on' : ''}>
                        ₹{(parseInt(amt, 10) / 100000).toFixed(0)}L
                      </button>
                    ))}
                  </div>
                </Field>

                <Field loan label="Tenure (Months)">
                  <select value={loanTenure} onChange={e => setLoanTenure(e.target.value)} className="is-strong">
                    <option value="12">12 Months (1 Year)</option>
                    <option value="24">24 Months (2 Years)</option>
                    <option value="36">36 Months (3 Years)</option>
                    <option value="48">48 Months (4 Years)</option>
                    <option value="60">60 Months (5 Years)</option>
                    <option value="84">84 Months (7 Years)</option>
                  </select>
                </Field>
              </div>

              <Field loan label="Loan Purpose">
                <select value={loanPurpose} onChange={e => setLoanPurpose(e.target.value)}>
                  <option value="Home Renovation & Living">Home Renovation & Living</option>
                  <option value="Medical Emergency">Medical Emergency</option>
                  <option value="Education & Upskilling">Higher Education / Degree</option>
                  <option value="Business Working Capital">Business Working Capital</option>
                  <option value="Green / Electric Vehicle">Electric Vehicle / Solar</option>
                  <option value="Debt Consolidation">Debt Consolidation</option>
                  <option value="Wedding & Personal">Wedding & Personal</option>
                </select>
              </Field>

              <div className="iob-emi">
                <span>Estimated Monthly EMI:</span>
                <span>₹{calculatedEmi.toLocaleString('en-IN')}/month</span>
              </div>
            </div>
          )}

          <div className="iob-notice">
            <Info size={16} />
            <div>
              {isCard && (
                <span>
                  <strong>Standalone Card:</strong> No bank account will be created. Your credit card is evaluated independently with instant digital verification.
                </span>
              )}
              {isLoan && (
                <span>
                  <strong>Direct Disbursal:</strong> No account opening required. Once approved, loan funds can be disbursed into ANY existing bank account.
                </span>
              )}
              {isAccount && (
                <span>
                  <strong>Digital Account:</strong> Proceeding creates the banking profile. Authentication remains exclusively in Kosh Secure Sign-In.
                </span>
              )}
            </div>
          </div>

          <button type="submit" disabled={isLoading} className="mf-go mf-transition iob-submit">
            {isLoading ? (
              'Submitting Application…'
            ) : isCard ? (
              <>Submit Credit Card Application <ShieldCheck size={16} /></>
            ) : isLoan ? (
              <>Apply for Instant Loan Sanction <Coins size={16} /></>
            ) : (
              <>Continue to Digital Account Opening <ShieldCheck size={16} /></>
            )}
          </button>
        </form>
      )}
    </Modal>
  );
};

const PETAL = 'M24 11C30.5 18 30.5 28 24 35C17.5 28 17.5 18 24 11Z';
const BLOOM = [{ r: 0, s: 1 }, { r: -36, s: 0.9 }, { r: 36, s: 0.9 }, { r: -72, s: 0.72 }, { r: 72, s: 0.72 }];
const DRIFT = Array.from({ length: 7 }, (_, i) => {
  const a = Math.PI * (1.08 + (i / 6) * 0.84);  // fanned across the top half
  return { x: Math.cos(a) * 34, y: Math.sin(a) * 22 - 4, r: (i - 3) * 38 };
});

/** One-shot success moment: the Kosh lotus unfolds from its centre, a few loose petals drift up and fade, then it rests. Reduced motion: the still lotus. */
const LotusBloom: React.FC = () => {
  const reduce = useReducedMotion();
  const origin = { originX: 0.5, originY: 1 };
  return (
    <svg className="iob-bloom" viewBox="0 0 48 48" aria-hidden="true">
      {!reduce && DRIFT.map((d, i) => (
        <motion.path key={i} d={PETAL} className="drift" style={origin} initial={{ x: 0, y: 0, rotate: 0, scale: 0.2, opacity: 0 }}
          animate={{ x: d.x, y: d.y, rotate: d.r, scale: 0.34, opacity: [0, 0.9, 0] }} transition={{ duration: 1.5, delay: 0.45 + i * 0.04, ease: EASE }} />
      ))}
      {BLOOM.map(({ r, s }, i) => (
        <motion.path key={r} d={PETAL} style={origin} initial={reduce ? false : { rotate: 0, scale: 0.15, opacity: 0 }}
          animate={{ rotate: r, scale: s, opacity: 1 }} transition={{ duration: 0.8, delay: 0.08 + i * 0.07, ease: EASE }} />
      ))}
      <motion.path d="M13 37.5Q24 42.5 35 37.5" className="base" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: EASE }} />
    </svg>
  );
};

/** The label wraps its control, so screen readers announce it and a tap on the text focuses the field. */
const Field: React.FC<{ label: React.ReactNode; loan?: boolean; children: React.ReactNode }> = ({ label, loan, children }) => (
  <label className={loan ? 'iob-field loan' : 'iob-field'}>
    <span className="iob-label">{label}</span>
    {children}
  </label>
);

interface ResultViewProps {
  result: ProductApplyResponse;
  pending?: boolean;
  title: string;
  tag: string;
  intro: React.ReactNode;
  refLabel: string;
  rows: [string, React.ReactNode][];
  nextTitle: string;
  nextText?: string;
  /** [kicker, button label]; shown only when the response carries a cross-sell offer. */
  crossSell?: [string, string];
  onCopy: (text: string) => void;
  onCrossSell: (productId: string) => void;
  onDone: () => void;
}

/** Success banner, reference + key-value table, next steps, optional cross-sell, Done. */
const ResultView: React.FC<ResultViewProps> = ({ result, pending, title, tag, intro, refLabel, rows, nextTitle, nextText, crossSell, onCopy, onCrossSell, onDone }) => {
  const offer: CrossSellOffer | undefined = crossSell && result.cross_sell_offer;
  return (
    <div className="iob-stack">
      <div className={`iob-card iob-banner${pending ? ' pending' : ''}`}>
        {pending ? <Clock size={20} /> : <CheckCircle2 size={20} />}
        <div>
          <div className="iob-banner-head">
            <h4>{title}</h4>
            <span className="iob-tag">{tag}</span>
          </div>
          <p>{intro}</p>
        </div>
      </div>

      <div className="iob-card iob-table">
        <div className="iob-row ref">
          <span>{refLabel}</span>
          <div className="iob-ref">
            <strong>{result.application_ref}</strong>
            <button onClick={() => onCopy(result.application_ref || '')} title="Copy reference">
              <Copy size={14} />
            </button>
          </div>
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="iob-row">
            <span>{label}</span>
            {value}
          </div>
        ))}
      </div>

      <div className="iob-card iob-next">
        <div className="iob-next-head">
          {pending ? <ShieldCheck size={16} /> : <Clock size={16} />} {nextTitle}
        </div>
        <p className="iob-small">{nextText}</p>
      </div>

      {crossSell && offer && (
        <div className="iob-card iob-xsell">
          <div className="iob-xsell-kicker">
            <Sparkles size={14} /> {crossSell[0]}
          </div>
          <h5>{offer.title}</h5>
          <p className="iob-small">{offer.description}</p>
          <button type="button" onClick={() => onCrossSell(offer.product_id)} className="mf-transition">
            {crossSell[1]} <ArrowRight size={14} />
          </button>
        </div>
      )}

      <button onClick={onDone} className="mf-go mf-transition iob-done">
        Done · Return to Kosh
      </button>
    </div>
  );
};
