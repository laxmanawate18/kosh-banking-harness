import React, { useState, useMemo } from 'react';
import { Product, ProductApplyResponse } from '../../types/products';
import { applyForProduct, fetchProducts } from '../../services/products';
import { Modal } from '../common/Modal';
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

export const InstantOnboardingModal: React.FC<InstantOnboardingModalProps> = ({
  isOpen,
  onClose,
  product: initialProduct,
}) => {
  const [currentProduct, setCurrentProduct] = useState<Product | null>(initialProduct);

  // Sync with prop change when modal opens
  React.useEffect(() => {
    setCurrentProduct(initialProduct);
    setResult(null);
    setError('');
  }, [initialProduct, isOpen]);

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
  const category = (product?.category || '').toLowerCase();
  const isCard = category === 'cards';
  const isLoan = category === 'loans';
  const isAccount = !isCard && !isLoan;

  // Live Loan EMI calculation (Hook must be called unconditionally before any early return)
  const calculatedEmi = useMemo(() => {
    if (!product || isCard || isAccount) return 0;
    const p = parseFloat(loanAmount) || 0;
    const n = parseInt(loanTenure, 10) || 36;
    const rateMatch = (product.headline_rate || '').match(/(\d+(\.\d+)?)/);
    const annualRate = rateMatch ? parseFloat(rateMatch[1]) : 10.25;
    const r = annualRate / 100 / 12;
    if (p <= 0 || n <= 0) return 0;
    if (r === 0) return Math.round(p / n);
    return Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  }, [product, isCard, isAccount, loanAmount, loanTenure]);

  if (!product) return null;


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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      maxWidth={isCard || isLoan ? 'max-w-lg' : 'max-w-md'}
    >
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. CREDIT CARD APPLICATION RESULT VIEW                   */}
      {/* ========================================================= */}
      {result && result.application_type === 'credit_card' && (
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-[#e1f0e9] border border-[#c9d9d1] rounded-2xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#006b5e] shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-serif font-bold text-[#006b5e]">In-Principle Sanction Approved</h4>
                <span className="bg-[#006b5e] text-white text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Standalone Card
                </span>
              </div>
              <p className="text-xs text-[#102a2f] mt-1 leading-relaxed">
                Your application for the <strong>{result.card_title || product.title}</strong> has been received. 
                Zero bank account opening required.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#f1f5f2] rounded-2xl border border-[#d7e1dc] space-y-2.5">
            <div className="flex justify-between items-center pb-2 border-b border-[#d7e1dc]">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Application Reference:</span>
              <div className="flex items-center gap-1.5">
                <strong className="font-mono text-[#006b5e] text-xs font-bold">{result.application_ref}</strong>
                <button
                  onClick={() => handleCopy(result.application_ref || '')}
                  className="text-[#667a7c] hover:text-[#006b5e] p-1"
                  title="Copy reference"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Pre-Approved Credit Limit:</span>
              <strong className="text-sm font-bold text-[#102a2f]">{result.credit_limit || '₹1,50,000'}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Applicant Name:</span>
              <span className="text-[#102a2f] font-semibold">{result.applicant_name}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">PAN Masked:</span>
              <span className="font-mono text-[#102a2f]">{result.pan_masked}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Status:</span>
              <span className="text-[#006b5e] font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Soft-Sanction Active
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-white border border-[#d7e1dc] rounded-2xl space-y-2">
            <div className="flex items-center gap-1.5 text-[#006b5e] font-semibold text-xs">
              <Clock className="w-4 h-4" /> Next Steps & Delivery:
            </div>
            <p className="text-[11px] text-[#667a7c] leading-relaxed">
              {result.next_steps || 'Our underwriting team will verify your digital video-KYC and PAN. A tracking SMS has been sent to your mobile. Physical metal card will be delivered to your PIN code.'}
            </p>
          </div>

          {/* Optional Post-Application Cross-Sell */}
          {result.cross_sell_offer && (
            <div className="p-4 bg-gradient-to-r from-[#fffaf1] to-[#f4fbf7] border border-[#f2b860]/50 rounded-2xl space-y-2">
              <div className="flex items-center gap-1.5 text-[#b86e24] font-bold text-[11px] uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" /> Optional Banking Privilege
              </div>
              <h5 className="font-serif font-bold text-xs text-[#102a2f]">{result.cross_sell_offer.title}</h5>
              <p className="text-[11px] text-[#667a7c] leading-relaxed">
                {result.cross_sell_offer.description}
              </p>
              <button
                type="button"
                onClick={() => handleSwitchToCrossSell(result.cross_sell_offer!.product_id)}
                className="w-full mt-1 bg-white hover:bg-[#fffaf1] border border-[#f2b860] text-[#b86e24] py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                Explore Sovereign Account & 500 Pts <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full bg-[#006b5e] hover:bg-[#00544a] text-white py-3 rounded-2xl text-xs font-bold transition shadow-2xs"
          >
            Done · Return to Kosh
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. LOAN APPLICATION RESULT VIEW                          */}
      {/* ========================================================= */}
      {result && result.application_type === 'loan' && (
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-[#e1f0e9] border border-[#c9d9d1] rounded-2xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#006b5e] shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-serif font-bold text-[#006b5e]">In-Principle Soft Sanction Issued</h4>
                <span className="bg-[#006b5e] text-white text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Paperless Disbursal
                </span>
              </div>
              <p className="text-xs text-[#102a2f] mt-1 leading-relaxed">
                Your loan request for <strong>{result.loan_title || product.title}</strong> is pre-approved. 
                Disbursement can be sent directly to <strong>ANY bank account</strong> you hold.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#f1f5f2] rounded-2xl border border-[#d7e1dc] space-y-2.5">
            <div className="flex justify-between items-center pb-2 border-b border-[#d7e1dc]">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Loan Reference ID:</span>
              <div className="flex items-center gap-1.5">
                <strong className="font-mono text-[#006b5e] text-xs font-bold">{result.application_ref}</strong>
                <button
                  onClick={() => handleCopy(result.application_ref || '')}
                  className="text-[#667a7c] hover:text-[#006b5e] p-1"
                  title="Copy reference"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Sanctioned Amount:</span>
              <strong className="text-sm font-bold text-[#102a2f]">{result.loan_amount}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Estimated EMI:</span>
              <strong className="text-sm font-bold text-[#006b5e]">{result.estimated_emi}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Tenure & Rate:</span>
              <span className="text-[#102a2f] font-semibold">{result.tenure_months} Months @ {result.headline_rate}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Applicant:</span>
              <span className="text-[#102a2f]">{result.applicant_name} ({result.pan_masked})</span>
            </div>
          </div>

          <div className="p-3.5 bg-white border border-[#d7e1dc] rounded-2xl space-y-2">
            <div className="flex items-center gap-1.5 text-[#006b5e] font-semibold text-xs">
              <Clock className="w-4 h-4" /> Next Steps:
            </div>
            <p className="text-[11px] text-[#667a7c] leading-relaxed">
              {result.next_steps}
            </p>
          </div>

          {/* Optional Post-Loan Cross-Sell */}
          {result.cross_sell_offer && (
            <div className="p-4 bg-gradient-to-r from-[#fffaf1] to-[#f4fbf7] border border-[#f2b860]/50 rounded-2xl space-y-2">
              <div className="flex items-center gap-1.5 text-[#b86e24] font-bold text-[11px] uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" /> Priority Disbursal Perk
              </div>
              <h5 className="font-serif font-bold text-xs text-[#102a2f]">{result.cross_sell_offer.title}</h5>
              <p className="text-[11px] text-[#667a7c] leading-relaxed">
                {result.cross_sell_offer.description}
              </p>
              <button
                type="button"
                onClick={() => handleSwitchToCrossSell(result.cross_sell_offer!.product_id)}
                className="w-full mt-1 bg-white hover:bg-[#fffaf1] border border-[#f2b860] text-[#b86e24] py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                Open Sovereign Account (Zero Fee Disbursal) <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full bg-[#006b5e] hover:bg-[#00544a] text-white py-3 rounded-2xl text-xs font-bold transition shadow-2xs"
          >
            Done · Return to Kosh
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. PENDING OFFICER APPROVAL VIEW                          */}
      {/* ========================================================= */}
      {result && result.status === 'PENDING_APPROVAL' && (
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-[#fffaf0] border border-[#fbd38d] rounded-2xl flex items-start gap-3">
            <Clock className="w-5 h-5 text-[#b86e24] shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-serif font-bold text-[#b86e24]">Application Under Officer Review</h4>
                <span className="bg-[#b86e24] text-white text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Pending Approval
                </span>
              </div>
              <p className="text-xs text-[#102a2f] mt-1 leading-relaxed">
                Your application for <strong>{result.product?.title || product.title}</strong> has been received by Kosh Banking Operations.
              </p>
            </div>
          </div>

          <div className="p-4 bg-[#f1f5f2] rounded-2xl border border-[#d7e1dc] space-y-2.5">
            <div className="flex justify-between items-center pb-2 border-b border-[#d7e1dc]">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Application Reference:</span>
              <div className="flex items-center gap-1.5">
                <strong className="font-mono text-[#006b5e] text-xs font-bold">{result.application_ref}</strong>
                <button
                  onClick={() => handleCopy(result.application_ref || '')}
                  className="text-[#667a7c] hover:text-[#006b5e] p-1"
                  title="Copy reference"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Applicant Name:</span>
              <span className="text-[#102a2f] font-semibold">{result.applicant_name}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Registered Email:</span>
              <strong className="text-xs font-mono text-[#006b5e]">{result.email}</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Mobile Verification:</span>
              <span className="font-mono text-[#102a2f]">{result.phone_number}</span>
            </div>
          </div>

          <div className="p-3.5 bg-white border border-[#d7e1dc] rounded-2xl space-y-2">
            <div className="flex items-center gap-1.5 text-[#006b5e] font-semibold text-xs">
              <ShieldCheck className="w-4 h-4" /> Next Steps:
            </div>
            <p className="text-[11px] text-[#667a7c] leading-relaxed">
              {result.next_steps || `A Bank Operations Officer will review and approve your application. Upon approval, your digital banking credentials and temporary login password will be dispatched to ${result.email}.`}
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-[#006b5e] hover:bg-[#00544a] text-white py-3 rounded-2xl text-xs font-bold transition shadow-2xs"
          >
            Done · Return to Kosh
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. SAVINGS / DEMO ACCOUNT RESULT VIEW (LEGACY PROFILE)    */}
      {/* ========================================================= */}
      {result && result.status !== 'PENDING_APPROVAL' && result.application_type === 'savings_account' && result.profile && (
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-[#e1f0e9] border border-[#c9d9d1] rounded-2xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#006b5e] shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-serif font-bold text-[#006b5e]">Simulated Account Ready</h4>
              <p className="text-xs text-[#102a2f] mt-0.5">
                Demo account <strong className="font-mono">{result.account?.account_number}</strong> was created locally.
              </p>
            </div>
          </div>

          <div className="p-5 bg-[#f1f5f2] rounded-2xl border border-[#d7e1dc] space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Customer Name:</span>
              <strong className="text-[#102a2f] font-semibold">{result.profile.display_name}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Customer ID:</span>
              <strong className="font-mono text-[#102a2f]">{result.profile.customer_id}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Mobile:</span>
              <strong className="font-mono text-[#006b5e] bg-white px-2 py-0.5 rounded border border-[#d7e1dc]">{result.profile.phone_number}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#667a7c] font-mono uppercase text-[10px]">Authentication:</span>
              <strong className="text-[#006b5e]">Kosh Secure Sign-In</strong>
            </div>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={() => handleCopy(`Kosh profile ${result.profile?.customer_id}\nAccount: ${result.account?.account_number}`)}
              className="flex-1 border border-[#d7e1dc] hover:bg-[#f1f5f2] py-3.5 rounded-2xl text-xs font-bold text-[#102a2f] flex items-center justify-center gap-1.5 transition"
            >
              <Copy className="w-4 h-4 text-[#667a7c]" /> {copied ? 'Copied!' : 'Copy reference'}
            </button>
            <button
              onClick={handleSecureSignIn}
              className="flex-1 bg-[#006b5e] hover:bg-[#00544a] text-white py-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-2xs"
            >
              Continue to Secure Sign-In <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. APPLICATION FORM (CARDS, LOANS, OR SAVINGS)           */}
      {/* ========================================================= */}
      {!result && (
        <form onSubmit={handleApply} className="space-y-4 text-xs">
          {/* Product Headline Banner */}
          <div className="p-3.5 bg-[#f1f5f2] rounded-2xl border border-[#d7e1dc] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white rounded-xl border border-[#d7e1dc] text-[#006b5e]">
                {isCard ? <CreditCard className="w-5 h-5" /> : isLoan ? <Coins className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="font-serif font-bold text-xs text-[#102a2f]">{product.title}</h4>
                <p className="text-[10px] text-[#667a7c] font-mono">{product.category_label || product.category.toUpperCase()}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-[#006b5e] bg-white px-2 py-1 rounded-lg border border-[#d7e1dc]">
                {product.headline_rate}
              </span>
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-mono text-[10px] font-bold text-[#667a7c] uppercase tracking-wider mb-1.5">
                Full Legal Name (as on PAN)
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Vikram Singhania"
                required
                className="w-full px-3.5 py-2.5 bg-white border border-[#d7e1dc] rounded-xl focus:ring-2 focus:ring-[#006b5e] focus:outline-none text-xs text-[#102a2f]"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] font-bold text-[#667a7c] uppercase tracking-wider mb-1.5">
                Mobile Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                required
                className="w-full px-3.5 py-2.5 bg-white border border-[#d7e1dc] rounded-xl focus:ring-2 focus:ring-[#006b5e] focus:outline-none text-xs text-[#102a2f]"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] font-bold text-[#667a7c] uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vikram@example.com"
                required
                className="w-full px-3.5 py-2.5 bg-white border border-[#d7e1dc] rounded-xl focus:ring-2 focus:ring-[#006b5e] focus:outline-none text-xs text-[#102a2f]"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] font-bold text-[#667a7c] uppercase tracking-wider mb-1.5">
                Permanent Account Number (PAN)
              </label>
              <input
                type="text"
                value={panNumber}
                onChange={e => setPanNumber(e.target.value.toUpperCase())}
                placeholder="e.g. ABCDE1234F"
                maxLength={10}
                required={isCard || isLoan}
                className="w-full px-3.5 py-2.5 bg-white border border-[#d7e1dc] rounded-xl focus:ring-2 focus:ring-[#006b5e] focus:outline-none text-xs font-mono uppercase text-[#102a2f]"
              />
            </div>

            {/* Employment Status */}
            {(isCard || isLoan) && (
              <div>
                <label className="block font-mono text-[10px] font-bold text-[#667a7c] uppercase tracking-wider mb-1.5">
                  Employment / Persona
                </label>
                <select
                  value={employmentType}
                  onChange={e => setEmploymentType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#d7e1dc] rounded-xl focus:ring-2 focus:ring-[#006b5e] focus:outline-none text-xs text-[#102a2f]"
                >
                  <option value="Salaried">Salaried Professional</option>
                  <option value="Self-Employed">Self-Employed / Business Owner</option>
                  <option value="Student">College / University Student</option>
                  <option value="Freelancer">Freelancer / Consultant</option>
                </select>
              </div>
            )}

            {/* Monthly Income or Allowance */}
            {(isCard || isLoan) && (
              <div>
                <label className="block font-mono text-[10px] font-bold text-[#667a7c] uppercase tracking-wider mb-1.5">
                  {employmentType === 'Student' ? 'Monthly Allowance / Stipend (₹)' : 'Monthly Net In-Hand Income (₹)'}
                </label>
                <input
                  type="number"
                  value={monthlyIncome}
                  onChange={e => setMonthlyIncome(e.target.value)}
                  placeholder="85000"
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-[#d7e1dc] rounded-xl focus:ring-2 focus:ring-[#006b5e] focus:outline-none text-xs text-[#102a2f]"
                />
              </div>
            )}

            {/* Employer or College */}
            {(isCard || isLoan) && (
              <div>
                <label className="block font-mono text-[10px] font-bold text-[#667a7c] uppercase tracking-wider mb-1.5">
                  {employmentType === 'Student' ? 'University / College Name' : 'Company / Employer Name'}
                </label>
                <input
                  type="text"
                  value={employerOrCollege}
                  onChange={e => setEmployerOrCollege(e.target.value)}
                  placeholder={employmentType === 'Student' ? 'e.g. IIT Bombay' : 'e.g. Tata Consultancy Services'}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#d7e1dc] rounded-xl focus:ring-2 focus:ring-[#006b5e] focus:outline-none text-xs text-[#102a2f]"
                />
              </div>
            )}

            {/* PIN Code */}
            <div>
              <label className="block font-mono text-[10px] font-bold text-[#667a7c] uppercase tracking-wider mb-1.5">
                Current Residential PIN Code
              </label>
              <input
                type="text"
                value={pincode}
                onChange={e => setPincode(e.target.value)}
                placeholder="400001"
                maxLength={6}
                required
                className="w-full px-3.5 py-2.5 bg-white border border-[#d7e1dc] rounded-xl focus:ring-2 focus:ring-[#006b5e] focus:outline-none text-xs text-[#102a2f]"
              />
            </div>
          </div>

          {/* LOAN SPECIFIC SECTION */}
          {isLoan && (
            <div className="p-4 bg-[#f8faf8] border border-[#d7e1dc] rounded-2xl space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-[#006b5e] uppercase tracking-wider flex items-center gap-1.5">
                  <Coins className="w-4 h-4" /> Loan Amount & Tenure Configurator
                </span>
                <span className="text-[11px] font-mono text-[#667a7c]">Live Estimate</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] text-[#667a7c] uppercase mb-1">
                    Required Loan Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={loanAmount}
                    onChange={e => setLoanAmount(e.target.value)}
                    min={50000}
                    step={25000}
                    className="w-full px-3 py-2 bg-white border border-[#d7e1dc] rounded-xl text-xs font-semibold text-[#102a2f]"
                  />
                  <div className="flex gap-1.5 mt-1.5">
                    {['200000', '500000', '1000000'].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setLoanAmount(amt)}
                        className={`text-[9px] px-2 py-0.5 rounded-lg border transition font-mono ${
                          loanAmount === amt ? 'bg-[#006b5e] text-white border-[#006b5e]' : 'bg-white text-[#667a7c] border-[#d7e1dc]'
                        }`}
                      >
                        ₹{(parseInt(amt, 10) / 100000).toFixed(0)}L
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-mono text-[10px] text-[#667a7c] uppercase mb-1">
                    Tenure (Months)
                  </label>
                  <select
                    value={loanTenure}
                    onChange={e => setLoanTenure(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d7e1dc] rounded-xl text-xs font-semibold text-[#102a2f]"
                  >
                    <option value="12">12 Months (1 Year)</option>
                    <option value="24">24 Months (2 Years)</option>
                    <option value="36">36 Months (3 Years)</option>
                    <option value="48">48 Months (4 Years)</option>
                    <option value="60">60 Months (5 Years)</option>
                    <option value="84">84 Months (7 Years)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-mono text-[10px] text-[#667a7c] uppercase mb-1">
                  Loan Purpose
                </label>
                <select
                  value={loanPurpose}
                  onChange={e => setLoanPurpose(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d7e1dc] rounded-xl text-xs text-[#102a2f]"
                >
                  <option value="Home Renovation & Living">Home Renovation & Living</option>
                  <option value="Medical Emergency">Medical Emergency</option>
                  <option value="Education & Upskilling">Higher Education / Degree</option>
                  <option value="Business Working Capital">Business Working Capital</option>
                  <option value="Green / Electric Vehicle">Electric Vehicle / Solar</option>
                  <option value="Debt Consolidation">Debt Consolidation</option>
                  <option value="Wedding & Personal">Wedding & Personal</option>
                </select>
              </div>

              {/* Calculated EMI Display */}
              <div className="p-3 bg-white rounded-xl border border-[#c9d9d1] flex items-center justify-between">
                <span className="text-[11px] text-[#667a7c]">Estimated Monthly EMI:</span>
                <span className="font-mono text-sm font-bold text-[#006b5e]">
                  ₹{calculatedEmi.toLocaleString('en-IN')}/month
                </span>
              </div>
            </div>
          )}

          {/* Standalone Product Notice */}
          <div className="p-3 bg-[#e1f0e9]/50 border border-[#c9d9d1] rounded-xl text-[#006b5e] text-[11px] leading-relaxed flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
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

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#006b5e] hover:bg-[#00544a] text-white font-bold py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2 transition shadow-2xs disabled:opacity-50 text-xs tracking-wide"
          >
            {isLoading ? (
              'Submitting Application…'
            ) : isCard ? (
              <>Submit Credit Card Application <ShieldCheck className="w-4 h-4" /></>
            ) : isLoan ? (
              <>Apply for Instant Loan Sanction <Coins className="w-4 h-4" /></>
            ) : (
              <>Continue to Digital Account Opening <ShieldCheck className="w-4 h-4" /></>
            )}
          </button>
        </form>
      )}
    </Modal>
  );
};
