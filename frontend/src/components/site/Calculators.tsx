import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { fdMaturity, formatRupees, maxEligibleLoan, monthlyEmi, rdMaturity } from '../common/Formatters';
import { ActiveIndicator, AnimatedNumber, motion, pageMotion } from '../common/Animate';
import { PageHero } from './SiteChrome';

/** A rupee result that counts to its new value as the sliders move. */
const Rupees: React.FC<{ value: number }> = ({ value }) => <AnimatedNumber value={value} format={formatRupees} />;

type Ask = (prompt: string) => void;

const Slider: React.FC<{
  label: string; value: number; set: (n: number) => void; min: number; max: number; step: number; show: string;
}> = ({ label, value, set, min, max, step, show }) => (
  <label className="k-slider">
    <span><span>{label}</span><strong>{show}</strong></span>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => set(Number(e.target.value))}
      aria-valuetext={show}
      style={{ '--p': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
    />
  </label>
);

const Row: React.FC<{ label: string; value: React.ReactNode; swatch?: string }> = ({ label, value, swatch }) => (
  <div><dt>{swatch && <i className={`sw ${swatch}`} />}{label}</dt><dd>{value}</dd></div>
);

export const EmiCalculator: React.FC<{ onAsk: Ask }> = ({ onAsk }) => {
  const { t } = useI18n();
  const [amount, setAmount] = useState(2_500_000);
  const [rate, setRate] = useState(8.5);
  const [years, setYears] = useState(15);
  const emi = monthlyEmi(amount, rate, years * 12);
  const total = emi * years * 12;
  const share = total > 0 ? (total - amount) / total : 0;
  return (
    <div className="k-calc">
      <div>
        <h3>{t('Loan EMI calculator')}</h3>
        <Slider label={t('Loan amount')} value={amount} set={setAmount} min={100_000} max={10_000_000} step={50_000} show={formatRupees(amount)} />
        <Slider label={t('Interest rate per year')} value={rate} set={setRate} min={6} max={16} step={0.05} show={`${rate.toFixed(2)}%`} />
        <Slider label={t('Tenure')} value={years} set={setYears} min={1} max={30} step={1} show={t('{n} years', { n: years })} />
      </div>
      <div className="k-calc-result">
        <div className="k-donut" style={{ '--i': share } as React.CSSProperties} role="img" aria-label={t('Interest is {pct}% of what you repay', { pct: Math.round(share * 100) })}>
          <div><small>{t('Monthly EMI')}</small><strong><Rupees value={emi} /></strong></div>
        </div>
        <dl>
          <Row label={t('Principal')} value={<Rupees value={amount} />} swatch="principal" />
          <Row label={t('Total interest')} value={<Rupees value={total - amount} />} swatch="interest" />
          <Row label={t('Total payable')} value={<Rupees value={total} />} />
        </dl>
        <button type="button" className="k-btn primary" onClick={() => onAsk(t('I want a loan of {amount} for {years} years at about {rate}%. Can you check my eligibility?', { amount: formatRupees(amount), years, rate }))}>
          {t('Check eligibility with Mitra')}
        </button>
      </div>
    </div>
  );
};

const FdCalculator: React.FC<{ onAsk: Ask }> = ({ onAsk }) => {
  const { t } = useI18n();
  const [amount, setAmount] = useState(100_000);
  const [rate, setRate] = useState(7.75);
  const [years, setYears] = useState(2);
  const [senior, setSenior] = useState(false);
  const effective = rate + (senior ? 0.5 : 0);
  const maturity = fdMaturity(amount, effective, years);
  return (
    <div className="k-calc">
      <div>
        <h3>{t('Fixed deposit calculator')}</h3>
        <Slider label={t('Deposit amount')} value={amount} set={setAmount} min={5_000} max={5_000_000} step={5_000} show={formatRupees(amount)} />
        <Slider label={t('Interest rate per year')} value={rate} set={setRate} min={3} max={9} step={0.05} show={`${rate.toFixed(2)}%`} />
        <Slider label={t('Tenure')} value={years} set={setYears} min={1} max={10} step={1} show={t('{n} years', { n: years })} />
        <label className="k-toggle-row" style={{ borderTop: 0 }}>
          <div><Icon name="senior" /><div><strong>{t('Senior citizen')}</strong><small>{t('Adds 0.50% to the rate')}</small></div></div>
          <input type="checkbox" className="k-switch" checked={senior} onChange={e => setSenior(e.target.checked)} />
        </label>
      </div>
      <div className="k-calc-result">
        <div className="k-calc-big"><small>{t('Maturity amount')}</small><strong><Rupees value={maturity} /></strong></div>
        <dl>
          <Row label={t('You invest')} value={<Rupees value={amount} />} swatch="principal" />
          <Row label={t('Interest earned')} value={<Rupees value={maturity - amount} />} swatch="interest" />
          <Row label={t('Effective rate')} value={`${effective.toFixed(2)}%`} />
        </dl>
        <p className="k-product-fine">{t('Compounded quarterly. TDS may apply if interest exceeds the yearly limit.')}</p>
        <button type="button" className="k-btn primary" onClick={() => onAsk(t('I want to open an FD of {amount} for {years} years. What would I earn?', { amount: formatRupees(amount), years }))}>
          {t('Open an FD with Mitra')}
        </button>
      </div>
    </div>
  );
};

const RdCalculator: React.FC<{ onAsk: Ask }> = ({ onAsk }) => {
  const { t } = useI18n();
  const [monthly, setMonthly] = useState(5_000);
  const [rate, setRate] = useState(7);
  const [months, setMonths] = useState(24);
  const maturity = rdMaturity(monthly, rate, months);
  const invested = monthly * months;
  return (
    <div className="k-calc">
      <div>
        <h3>{t('Recurring deposit calculator')}</h3>
        <Slider label={t('Monthly instalment')} value={monthly} set={setMonthly} min={500} max={100_000} step={500} show={formatRupees(monthly)} />
        <Slider label={t('Interest rate per year')} value={rate} set={setRate} min={3} max={9} step={0.05} show={`${rate.toFixed(2)}%`} />
        <Slider label={t('Tenure')} value={months} set={setMonths} min={6} max={120} step={3} show={t('{n} months', { n: months })} />
      </div>
      <div className="k-calc-result">
        <div className="k-calc-big"><small>{t('Maturity amount')}</small><strong><Rupees value={maturity} /></strong></div>
        <dl>
          <Row label={t('You invest')} value={<Rupees value={invested} />} swatch="principal" />
          <Row label={t('Interest earned')} value={<Rupees value={maturity - invested} />} swatch="interest" />
        </dl>
        <button type="button" className="k-btn primary" onClick={() => onAsk(t('I want to start an RD of {amount} a month for {months} months.', { amount: formatRupees(monthly), months }))}>
          {t('Start an RD with Mitra')}
        </button>
      </div>
    </div>
  );
};

const EligibilityCalculator: React.FC<{ onAsk: Ask }> = ({ onAsk }) => {
  const { t } = useI18n();
  const [income, setIncome] = useState(100_000);
  const [existing, setExisting] = useState(0);
  const [rate, setRate] = useState(8.35);
  const [years, setYears] = useState(20);
  const loan = maxEligibleLoan(income, existing, rate, years * 12);
  return (
    <div className="k-calc">
      <div>
        <h3>{t('Home loan eligibility')}</h3>
        <Slider label={t('Monthly take-home income')} value={income} set={setIncome} min={15_000} max={1_000_000} step={5_000} show={formatRupees(income)} />
        <Slider label={t('Existing EMIs per month')} value={existing} set={setExisting} min={0} max={200_000} step={1_000} show={formatRupees(existing)} />
        <Slider label={t('Interest rate per year')} value={rate} set={setRate} min={7} max={14} step={0.05} show={`${rate.toFixed(2)}%`} />
        <Slider label={t('Tenure')} value={years} set={setYears} min={5} max={30} step={1} show={t('{n} years', { n: years })} />
      </div>
      <div className="k-calc-result">
        <div className="k-calc-big"><small>{t('You may be eligible for up to')}</small><strong><Rupees value={loan} /></strong></div>
        <dl>
          <Row label={t('EMI you can afford')} value={<Rupees value={Math.max(0, income * 0.5 - existing)} />} />
        </dl>
        <p className="k-product-fine">{t('Based on up to 50% of income going to EMIs. The final amount depends on your credit score and documents.')}</p>
        <button type="button" className="k-btn primary" onClick={() => onAsk(t('My take-home income is {income} a month. How much home loan can I get?', { income: formatRupees(income) }))}>
          {t('Check eligibility with Mitra')}
        </button>
      </div>
    </div>
  );
};

const TABS = [
  ['emi', 'Loan EMI'],
  ['fd', 'Fixed deposit'],
  ['rd', 'Recurring deposit'],
  ['eligibility', 'Loan eligibility'],
] as const;

export const CalculatorsPage: React.FC<{ tab?: string; onAsk: Ask }> = ({ tab = 'emi', onAsk }) => {
  const { t } = useI18n();
  const active = TABS.some(([id]) => id === tab) ? tab : 'emi';
  return (
    <>
      <PageHero eyebrow={t('Plan ahead')} title={t('Calculators')} intro={t('Plan loans and savings with the same formulas Indian banks use. Results are estimates, not offers.')} />
      <section className="k-section">
        <nav className="k-tabs-row" aria-label={t('Calculators')}>
          {TABS.map(([id, label]) => (
            <a key={id} href={`#/calculators/${id}`} aria-current={active === id ? 'page' : undefined}>
              {active === id && <ActiveIndicator id="calculator-tab" />}<Icon name="calculator" /> {t(label)}
            </a>
          ))}
        </nav>
        <motion.div key={active} {...pageMotion}>
          {active === 'emi' && <EmiCalculator onAsk={onAsk} />}
          {active === 'fd' && <FdCalculator onAsk={onAsk} />}
          {active === 'rd' && <RdCalculator onAsk={onAsk} />}
          {active === 'eligibility' && <EligibilityCalculator onAsk={onAsk} />}
        </motion.div>
      </section>
    </>
  );
};
