export function formatMoney(minorUnits: number = 0): string {
  const sign = minorUnits < 0 ? '-' : '';
  const abs = Math.abs(minorUnits) / 100;
  return sign + '₹' + abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function monthlyEmi(principal: number, annualRatePct: number, months: number): number {
  const r = annualRatePct / 1200;
  if (months <= 0) return 0;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

/** FD maturity with quarterly compounding, as Indian banks quote it. */
export function fdMaturity(principal: number, annualRatePct: number, years: number): number {
  return principal * Math.pow(1 + annualRatePct / 400, 4 * years);
}

/** RD maturity: monthly instalment, quarterly compounding (standard Indian bank formula). */
export function rdMaturity(monthly: number, annualRatePct: number, months: number): number {
  const i = annualRatePct / 400;
  if (i === 0) return monthly * months;
  return (monthly * (Math.pow(1 + i, months / 3) - 1)) / (1 - Math.pow(1 + i, -1 / 3));
}

/** Largest loan whose EMI fits in 50% of monthly income after existing EMIs (common FOIR rule). */
export function maxEligibleLoan(monthlyIncome: number, existingEmi: number, annualRatePct: number, months: number): number {
  const affordable = Math.max(0, monthlyIncome * 0.5 - existingEmi);
  const perRupee = monthlyEmi(1, annualRatePct, months);
  return perRupee > 0 ? affordable / perRupee : 0;
}

export function formatRupees(rupees: number): string {
  return '₹' + Math.round(rupees).toLocaleString('en-IN');
}

export function formatDate(isoString: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return isoString;
  }
}

export function formatTime(isoString: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}

export function formatDateTime(isoString: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return isoString;
  }
}


/** A system code as words a person can read: "P2P_TRANSFER" -> "P2P transfer", "ELECTRICITY" -> "Electricity". */
export function humanizeCode(code: string | null | undefined): string {
  if (!code) return '';
  const words = String(code).replace(/[_-]+/g, ' ').trim().toLowerCase();
  const fixed = words.replace(/\b(upi|kyc|pan|emi|fd|rd|atm|neft|imps|rtgs|ifsc|p2p|otp|id|pin|cvv|nri|gst|tds)\b/g, w => w.toUpperCase());
  return fixed.charAt(0).toUpperCase() + fixed.slice(1);
}
