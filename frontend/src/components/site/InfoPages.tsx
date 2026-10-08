import React, { useId, useState } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { LotusMark } from '../common/KoshLogo';
import type { Product } from '../../types/products';
import { ActiveIndicator, AnimatePresence, DUR, EASE, Reveal, Stagger, motion, pageMotion } from '../common/Animate';
import { useReducedMotion } from 'framer-motion';
import { PageHero } from './SiteChrome';

type Ask = (prompt: string) => void;

const Table: React.FC<{ caption: string; head: string[]; rows: string[][]; numCols?: number[]; hot?: number }> = ({ caption, head, rows, numCols = [], hot }) => (
  <Reveal className="k-table-wrap">
    <table className="k-table">
      <caption>{caption}</caption>
      <thead><tr>{head.map((h, i) => <th key={h} scope="col" className={numCols.includes(i) ? 'num' : ''}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className={ri === hot ? 'is-hot' : undefined}>{r.map((c, i) => i === 0
            ? <th key={i} scope="row">{c}</th>
            : <td key={i} className={numCols.includes(i) ? 'num' : ''}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </Reveal>
);

export const RatesPage: React.FC<{ products: Product[] }> = ({ products }) => {
  const { t } = useI18n();
  const rate = (id: string, fallback: string) => products.find(p => p.id === id)?.headline_rate || fallback;
  return (
    <>
      <PageHero eyebrow={t('Bank with us')} title={t('Interest rates')} intro={t('Illustrative rates for the Kosh demo bank, effective 1 September 2026. Real banks publish rates like these and revise them when the RBI changes the repo rate.')} />
      <section className="k-section k-tables">
        <Table
          caption={t('Savings accounts')}
          head={[t('Account'), t('Balance'), t('Rate per year')]}
          numCols={[2]}
          rows={[
            [t('Kosh Digital Smart Savings'), t('Any balance'), rate('PROD-SAV-DIGITAL', '6.50% p.a.')],
            [t('Kosh Suvarna Premier Savings'), t('Any balance'), rate('PROD-SAV-PREMIER', '7.20% p.a.')],
          ]}
        />
        <Table
          caption={t('Fixed deposits (below ₹3 crore)')}
          head={[t('Tenure'), t('General'), t('Senior citizens')]}
          numCols={[1, 2]}
          hot={4}
          rows={[
            [t('7 to 45 days'), '3.50%', '4.00%'],
            [t('46 to 179 days'), '5.25%', '5.75%'],
            [t('180 days to under 1 year'), '6.25%', '6.75%'],
            [t('1 year to under 2 years'), '7.25%', '7.75%'],
            [t('Kosh Vriddhi special, 444 days'), '8.10%', '8.60%'],
            [t('2 years to 5 years'), '7.10%', '7.60%'],
            [t('Above 5 years to 10 years'), '6.75%', '7.25%'],
          ]}
        />
        <Table
          caption={t('Loans')}
          head={[t('Loan'), t('Tenure'), t('Starting rate per year')]}
          numCols={[2]}
          rows={[
            [t('Kosh Griha Green Home Loan'), t('Up to 30 years'), rate('PROD-LOAN-HOME', '8.35% p.a.')],
            [t('Kosh Express Personal Loan'), t('1 to 5 years'), rate('PROD-LOAN-EXPRESS', '10.99% p.a.')],
          ]}
        />
        <Reveal className="k-note"><Icon name="info" /><span>{t('Interest on savings is calculated on the daily balance and credited quarterly. TDS applies to deposit interest above the yearly limit unless you submit Form 15G or 15H.')}</span></Reveal>
      </section>
    </>
  );
};

export const FeesPage: React.FC = () => {
  const { t } = useI18n();
  return (
    <>
      <PageHero eyebrow={t('Bank with us')} title={t('Fees and charges')} intro={t('Everything we charge, in one place. GST at 18% applies on top of these illustrative fees.')} />
      <section className="k-section k-tables">
        <Table
          caption={t('Account and payments')}
          head={[t('Service'), t('Charge')]}
          numCols={[1]}
          rows={[
            [t('Account opening'), '₹0'],
            [t('Minimum balance (zero-balance accounts)'), '₹0'],
            [t('UPI, IMPS, NEFT and RTGS transfers'), '₹0'],
            [t('SMS and email alerts'), '₹0'],
            [t('Duplicate physical statement'), '₹100'],
          ]}
        />
        <Table
          caption={t('Cheques')}
          head={[t('Service'), t('Charge')]}
          numCols={[1]}
          rows={[
            [t('First 25 cheque leaves each year'), '₹0'],
            [t('Additional cheque leaves'), t('₹4 per leaf')],
            [t('Stop cheque'), '₹100'],
            [t('Cheque return (insufficient funds)'), '₹350'],
          ]}
        />
        <Table
          caption={t('Debit cards and ATMs')}
          head={[t('Service'), t('Charge')]}
          numCols={[1]}
          rows={[
            [t('Debit card annual fee, first year'), '₹0'],
            [t('Debit card annual fee, from second year'), '₹250'],
            [t('Card replacement'), '₹200'],
            [t('Kosh ATM withdrawals'), t('5 free a month, then ₹21')],
            [t('Other bank ATM withdrawals'), t('3 free in metros, 5 elsewhere, then ₹21')],
          ]}
        />
      </section>
    </>
  );
};

const BRANCHES = [
  ['Mumbai Fort', 'Horniman Circle, Fort, Mumbai 400001'],
  ['Mumbai Andheri', 'Andheri Kurla Road, Andheri East, Mumbai 400069'],
  ['Mumbai Bandra', 'Hill Road, Bandra West, Mumbai 400050'],
];

export const HelpPage: React.FC<{ onAsk: Ask }> = ({ onAsk }) => {
  const { t } = useI18n();
  const contacts: [string, string, string, string][] = [
    ['headset', '1800 210 5674', 'tel:18002105674', t('24×7 customer care, toll free (demo number)')],
    ['mail', 'care@kosh.bank', 'mailto:care@kosh.bank', t('Replies within one working day (demo address)')],
    ['phone', '1930', 'tel:1930', t('National cyber crime helpline for fraud. Also cybercrime.gov.in')],
  ];
  return (
    <>
      <PageHero eyebrow={t('Help')} title={t('Help and grievances')} intro={t('Reach us any time. If a complaint is not resolved, you can escalate step by step, up to the RBI Ombudsman.')} />
      <section className="k-section">
        <Stagger className="k-contact-grid">
          {contacts.map(([icon, label, href, note]) => (
            <Stagger.Item as="a" key={href} className="k-card" href={href}>
              <Icon name={icon} /><strong>{label}</strong><span>{note}</span>
            </Stagger.Item>
          ))}
        </Stagger>
        <Reveal className="k-page-block">
          <h2 className="k-page-h2">{t('How to raise a complaint')}</h2>
          <ol className="k-ladder">
            <li><h3>{t('Talk to us')}</h3><p>{t('Call, email, visit a branch or ask Mitra. Most issues are fixed on the first contact.')}</p></li>
            <li><h3>{t('Grievance Redressal Officer')}</h3><p>{t('Not happy with the answer? Write to grievance@kosh.bank. We reply within 7 working days.')}</p></li>
            <li><h3>{t('Principal Nodal Officer')}</h3><p>{t('Still unresolved after 14 days? Escalate to nodal.officer@kosh.bank.')}</p></li>
            <li><h3>{t('RBI Integrated Ombudsman')}</h3><p>{t('If we do not resolve it within 30 days, or you disagree with our reply, file a free complaint at cms.rbi.org.in or call 14448.')}</p></li>
          </ol>
          <div className="k-hero-actions">
            <button type="button" className="k-btn primary" onClick={() => onAsk(t('I want to raise a complaint.'))}>{t('Raise it with Mitra')}</button>
            <a className="k-btn outline" href="#/faqs">{t('Read FAQs')}</a>
          </div>
        </Reveal>
        <Reveal className="k-page-block">
          <h2 className="k-page-h2">{t('Branches')}</h2>
          <ul className="k-branches">
            {BRANCHES.map(([name, addr]) => (
              <li key={name} className="k-card"><Icon name="pin" /><strong>{name}</strong><span>{addr}</span><span className="k-pill">{t('Mon to Sat, 10 to 4')}</span></li>
            ))}
          </ul>
        </Reveal>
      </section>
    </>
  );
};

const FAQ_GROUPS: [string, [string, string][]][] = [
  ['Accounts and KYC', [
    ['How long does it take to open an account?', 'About five minutes online. You get your account number immediately and full access after video or document KYC.'],
    ['Why do I need to complete KYC again?', 'RBI rules ask banks to refresh KYC periodically. Until it is done, some outward transfers may be paused.'],
    ['Is there a minimum balance?', 'Kosh Digital Smart Savings has no minimum balance. Premier accounts list their requirements on the rates page.'],
  ]],
  ['Payments and UPI', [
    ['Why was my payment held for approval?', 'Sentinel holds payments that look unusual, such as a new payee or a large amount, until you confirm them with an OTP in the secure Kavach dialog.'],
    ['Is there a limit after adding a new payee?', 'Yes. For the first 24 hours a new payee can receive up to ₹25,000. This cooling period protects you from fraud.'],
    ['How do I find my UPI ID?', 'Open UPI in the app. Your UPI ID and QR code are at the top, ready to share.'],
  ]],
  ['Cards', [
    ['How do I block my card?', 'Freeze it instantly from Cards, or ask Mitra. To unfreeze, raise a request and the bank confirms it within minutes.'],
    ['Can I turn off international use?', 'Yes. Card controls let you switch international, online and contactless use on or off.'],
  ]],
  ['Safety and Mitra', [
    ['Will Kosh ever ask for my OTP?', 'Never on a call, SMS or chat. OTPs are entered only in the trusted Kosh dialog on your own screen.'],
    ['Which languages does Mitra understand?', 'English, Hindi and Marathi, including Hinglish. Mitra replies in the language you write in.'],
  ]],
];

/** One question: a real button (aria-expanded/aria-controls) whose answer eases open, height and fade, and closes the same way. */
const Faq: React.FC<{ q: string; a: string }> = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const id = useId();
  return (
    <div className={`k-faq-item ${open ? 'open' : ''}`}>
      <h3><button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>{q}<Icon name="chevron-down" /></button></h3>
      <div id={id}>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div className="k-faq-a" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={reduce ? { duration: 0 } : { duration: DUR.slow, ease: EASE }}>
              <p>{a}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export const FaqsPage: React.FC<{ onAsk: Ask }> = ({ onAsk }) => {
  const { t } = useI18n();
  return (
    <>
      <PageHero eyebrow={t('Help')} title={t('Frequently asked questions')} intro={t('Quick answers to what customers ask most. Ask Mitra for anything else.')} />
      <section className="k-section">
        {FAQ_GROUPS.map(([group, items]) => (
          <Reveal key={group} className="k-faq-group">
            <h2>{t(group)}</h2>
            <div className="k-faq">
              {items.map(([q, a]) => <Faq key={q} q={t(q)} a={t(a)} />)}
            </div>
          </Reveal>
        ))}
        <Reveal className="k-cta-card">
          <div>
            <h2>{t('Still have a question?')}</h2>
            <p>{t('Mitra answers 24×7 in English, Hindi and Marathi')}</p>
          </div>
          <button type="button" className="k-btn primary lg" onClick={() => onAsk(t('I have a question about Kosh.'))}>{t('Ask Mitra')} <Icon name="arrow-right" /></button>
        </Reveal>
      </section>
    </>
  );
};

const SEGMENTS: Record<string, { icon: string; title: string; intro: string; benefits: string[]; docs: string[]; cat: string }> = {
  seniors: {
    icon: 'senior', title: 'Senior citizens', cat: 'deposits',
    intro: 'Extra interest, doorstep help and a calmer way to bank, for customers aged 60 and above.',
    benefits: ['0.50% extra on fixed deposits', 'Doorstep cash and cheque pickup', 'Priority queue at branches', 'Form 15H support to avoid unnecessary TDS'],
    docs: ['Aadhaar or passport', 'PAN card', 'Age proof if not on Aadhaar'],
  },
  women: {
    icon: 'women', title: 'Women', cat: 'savings',
    intro: 'A savings account and card built around financial independence, with safety features on by default.',
    benefits: ['Zero-balance savings account', 'Free accident insurance cover', 'Lower processing fee on home loans', 'Card controls and instant freeze'],
    docs: ['Aadhaar', 'PAN card'],
  },
  students: {
    icon: 'student', title: 'Students', cat: 'savings',
    intro: 'Your first bank account, with UPI, a debit card and no minimum balance.',
    benefits: ['No minimum balance until you turn 25', 'Free UPI and debit card', 'Education loan guidance with Mitra', 'Spending insights to build good habits'],
    docs: ['Aadhaar', 'PAN card or Form 60', 'College ID for education loans'],
  },
  nri: {
    icon: 'nri', title: 'NRI banking', cat: 'deposits',
    intro: 'NRE and NRO accounts to manage money in India while you live abroad.',
    benefits: ['Tax-free interest on NRE deposits', 'Repatriate NRE balances freely', 'Dedicated relationship manager', 'Pay family bills in India from abroad'],
    docs: ['Passport with valid visa', 'Overseas address proof', 'PAN card or Form 60'],
  },
  kisan: {
    icon: 'kisan', title: 'Kisan (farmers)', cat: 'loans',
    intro: 'Credit and savings that follow the crop cycle, not the calendar.',
    benefits: ['Kisan Credit Card with flexible repayment', 'Interest subvention on eligible crop loans', 'Direct benefit transfers credited quickly', 'Help in Marathi and Hindi with Mitra'],
    docs: ['Aadhaar', 'Land records (7/12 extract)', 'PAN card if available'],
  },
  business: {
    icon: 'business', title: 'Small business', cat: 'loans',
    intro: 'A current account, QR payments and working capital for shops and small firms.',
    benefits: ['Free UPI QR for your shop', 'Current account with high transaction limits', 'Working capital and MSME loans', 'GST-ready statements'],
    docs: ['Business registration or Udyam certificate', 'GST certificate if registered', 'Owner Aadhaar and PAN'],
  },
};

export const SegmentsPage: React.FC<{ id?: string; onAsk: Ask }> = ({ id = 'seniors', onAsk }) => {
  const { t } = useI18n();
  const key = SEGMENTS[id] ? id : 'seniors';
  const s = SEGMENTS[key];
  return (
    <>
      <PageHero eyebrow={t('Banking for everyone')} title={t(s.title)} intro={t(s.intro)} />
      <section className="k-section">
        <nav className="k-tabs-row" aria-label={t('Banking for everyone')}>
          {Object.entries(SEGMENTS).map(([sid, seg]) => (
            <a key={sid} href={`#/for/${sid}`} aria-current={sid === key ? 'page' : undefined}>
              {sid === key && <ActiveIndicator id="segment-tab" />}<Icon name={seg.icon} /> {t(seg.title)}
            </a>
          ))}
        </nav>
        <motion.div className="k-segment" key={key} {...pageMotion}>
          <div>
            <h2 className="k-page-h2">{t('What you get')}</h2>
            <Stagger as="ul" className="k-benefits">
              {s.benefits.map(b => <Stagger.Item as="li" key={b}><Icon name="check" />{t(b)}</Stagger.Item>)}
            </Stagger>
            <div className="k-hero-actions">
              <a className="k-btn primary" href={`#/products/${s.cat}`}>{t('See products')} <Icon name="arrow-right" /></a>
              <button type="button" className="k-btn outline" onClick={() => onAsk(t('Tell me about Kosh banking for {segment}.', { segment: t(s.title) }))}>{t('Ask Mitra')}</button>
            </div>
          </div>
          <aside>
            <h2>{t('What you need')}</h2>
            <ul className="k-dots">{s.docs.map(d => <li key={d}>{t(d)}</li>)}</ul>
          </aside>
        </motion.div>
      </section>
    </>
  );
};

const ARTICLES: { title: string; summary: string; tips: string[]; tag: string }[] = [
  {
    tag: 'Scam alert', title: 'Spot a UPI scam in five seconds',
    summary: 'You never need to enter your UPI PIN to receive money. A request that asks for your PIN is taking money out.',
    tips: ['Entering your PIN always sends money, it never receives it', 'Check the name that appears before you approve a collect request', 'Report suspicious requests to 1930 immediately'],
  },
  {
    tag: 'Scam alert', title: 'Digital arrest is not real',
    summary: 'Police, CBI or customs never question you on a video call or ask you to transfer money to clear your name.',
    tips: ['Hang up and call the agency on its official number', 'Never move money to a "safe account"', 'Tell a family member; scammers rely on isolation'],
  },
  {
    tag: 'Savings', title: 'Build an emergency fund',
    summary: 'Aim for three to six months of expenses in a savings account or sweep FD you can reach quickly.',
    tips: ['Start with one month and grow it with a small RD', 'Keep it separate from spending money', 'Top it up after every bonus or salary hike'],
  },
  {
    tag: 'Credit', title: 'What moves your credit score',
    summary: 'Paying EMIs and card bills on time matters most. Using less than 30% of your card limit helps too.',
    tips: ['Set up autopay for card bills', 'Avoid many loan applications in a short time', 'Check your report once a year for errors'],
  },
  {
    tag: 'Investing', title: 'FD, RD or SIP?',
    summary: 'FDs lock a lump sum at a fixed rate, RDs build savings monthly, and SIPs invest in markets with higher risk and potential returns.',
    tips: ['Use FDs for money you need in 1 to 3 years', 'Use RDs to form a monthly saving habit', 'Consider SIPs for goals more than 5 years away'],
  },
];

export const LearnPage: React.FC = () => {
  const { t } = useI18n();
  return (
    <>
      <PageHero eyebrow={t('Help')} title={t('Safe banking guide')} intro={t('Short, practical guides to protect your money and make it grow.')} />
      <section className="k-section">
        <Stagger className="k-articles">
          {ARTICLES.map((a, i) => (
            <Stagger.Item as="article" key={a.title} className={`k-article ${i === 0 ? 'lead' : ''}`}>
              <span className={`k-pill ${a.tag === 'Scam alert' ? 'danger' : 'brand'}`}>{a.tag === 'Scam alert' && <Icon name="alert" />}{t(a.tag)}</span>
              <h2>{t(a.title)}</h2>
              <p>{t(a.summary)}</p>
              <ul className="k-dots">{a.tips.map(tip => <li key={tip}>{t(tip)}</li>)}</ul>
            </Stagger.Item>
          ))}
        </Stagger>
      </section>
    </>
  );
};

export const NotFound: React.FC<{ home?: string }> = ({ home = '#/' }) => {
  const { t } = useI18n();
  return (
    <div className="k-404">
      <LotusMark size={72} />
      <h1>{t('This page took a wrong turn')}</h1>
      <p>{t('The link may be old or mistyped. Your money is safe, and everything else is one tap away.')}</p>
      <div className="k-actions-inline">
        <a className="k-btn primary" href={home}>{t('Go to home')}</a>
        <a className="k-btn outline" href="#/help">{t('Get help')}</a>
      </div>
    </div>
  );
};
