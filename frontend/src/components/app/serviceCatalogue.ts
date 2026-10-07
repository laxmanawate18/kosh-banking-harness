/** The bank's service catalogue in a customer's words: Services page, My requests, Deposits and notifications. */
import { humanizeCode } from '../common/Formatters';

type T = (key: string, vars?: Record<string, string | number>) => string;
export type Section = 'accounts' | 'cards' | 'cheques' | 'profile' | 'deposits' | 'help';
/** route: the page that already does it; workflow: a guided form Mitra fills; neither: ask Mitra in chat. */
export type Info = { section: Section; title: string; body: string; icon: string; route?: string; workflow?: string };

export const SECTIONS = (t: T): [Section, string][] => [
  ['accounts', t('Accounts')], ['cards', t('Cards')], ['cheques', t('Cheques')],
  ['profile', t('KYC and profile')], ['deposits', t('Deposits and lockers')], ['help', t('Help')],
];

/** The bank's service catalogue in a customer's words. Unknown services fall back to their own name under Help. */
export const CATALOGUE = (t: T): Record<string, Info> => ({
  'P1-01': { section: 'accounts', icon: 'wallet', route: 'accounts', title: t('Check your balance'), body: t('Available balance in each of your accounts.') },
  'P1-02': { section: 'accounts', icon: 'transactions', route: 'transactions', title: t('Recent transactions'), body: t('Your latest money in and money out.') },
  'P1-03': { section: 'accounts', icon: 'download', workflow: 'statement', title: t('Account statement'), body: t('Choose an account and dates, then download it.') },
  'P1-25': { section: 'accounts', icon: 'accounts', workflow: 'account_opening', title: t('Open a savings account'), body: t('Open another savings account. The bank checks it before it opens.') },
  'P2-10': { section: 'accounts', icon: 'calendar', workflow: 'standing_instruction', title: t('Set up a regular payment'), body: t('Pay a saved payee the same amount every month or quarter.') },
  'P2-11': { section: 'accounts', icon: 'pause', title: t('Stop a regular payment'), body: t('Cancel a standing instruction you no longer need.') },
  'P2-02': { section: 'accounts', icon: 'users', title: t('Add a joint holder'), body: t('Share an account with a family member.') },
  'P2-03': { section: 'accounts', icon: 'users', title: t('Remove a joint holder'), body: t('Take a joint holder off an account.') },
  'P2-04': { section: 'accounts', icon: 'settings', title: t('Change who can operate the account'), body: t('For example "either or survivor" for a joint account.') },
  'P2-06': { section: 'accounts', icon: 'undo', title: t('Reactivate a dormant account'), body: t('Make an account you have not used in a while active again.') },
  'P2-07': { section: 'accounts', icon: 'student', title: t('Convert a minor’s account'), body: t('Move the account to the holder’s own name when they turn 18.') },
  'P2-09': { section: 'accounts', icon: 'lock', title: t('Release money on hold'), body: t('Ask us to remove a lien once the reason for it has ended.') },
  'P2-01': { section: 'accounts', icon: 'logout', title: t('Close an account'), body: t('Close an account you no longer use. The bank reviews it first.') },
  'P1-10': { section: 'cards', icon: 'cards', route: 'cards', title: t('Card controls'), body: t('Turn online, international, tap and ATM use on or off.') },
  'P1-07': { section: 'cards', icon: 'freeze', route: 'cards', title: t('Freeze your card'), body: t('Stop your card working straight away if it is lost.') },
  'P1-09': { section: 'cards', icon: 'key', route: 'cards', title: t('Set a new card PIN'), body: t('Get a secure link to choose a new PIN.') },
  'P1-08': { section: 'cards', icon: 'undo', route: 'cards', title: t('Replace your card'), body: t('A new card if yours is lost, stolen or damaged.') },
  'P1-04': { section: 'cheques', icon: 'book', workflow: 'cheque_book', title: t('Order a cheque book'), body: t('25 or 50 leaves, delivered to your address.') },
  'P1-05': { section: 'cheques', icon: 'close', workflow: 'stop_cheque', title: t('Stop a cheque'), body: t('Stop payment on a lost or wrongly issued cheque.') },
  'P1-06': { section: 'cheques', icon: 'search', title: t('Check a cheque’s status'), body: t('Find out whether a cheque has cleared.') },
  'P1-17': { section: 'profile', icon: 'idcard', workflow: 'kyc', title: t('KYC and re-KYC'), body: t('Scan your documents and Mitra fills in the form.') },
  'P1-16': { section: 'profile', icon: 'shield', route: 'settings', title: t('Check your KYC status'), body: t('See when your KYC was last verified.') },
  'P1-12': { section: 'profile', icon: 'pin', workflow: 'address_update', title: t('Change your address'), body: t('Upload address proof and we update our records.') },
  'P1-11': { section: 'profile', icon: 'phone', route: 'settings', title: t('Update email or mobile'), body: t('Change the contact details we use to reach you.') },
  'P1-14': { section: 'profile', icon: 'users', workflow: 'nominee_update', title: t('Add or change a nominee'), body: t('Choose who receives your money if something happens to you.') },
  'P1-13': { section: 'profile', icon: 'beneficiaries', title: t('See your nominee'), body: t('Check who is registered as the nominee on each account.') },
  'P1-15': { section: 'profile', icon: 'idcard', title: t('Update your PAN'), body: t('Link or correct the PAN on your accounts.') },
  'P2-05': { section: 'profile', icon: 'file', title: t('Update your signature'), body: t('Register a new signature for cheques and forms.') },
  'P1-18': { section: 'deposits', icon: 'deposits', route: 'deposits', title: t('Your deposits'), body: t('Rates, terms and your deposit applications.') },
  'P1-19': { section: 'deposits', icon: 'deposits', route: 'deposits', title: t('Open a fixed deposit'), body: t('A lump sum for a fixed term at a fixed rate.') },
  'P1-20': { section: 'deposits', icon: 'calendar', route: 'deposits', title: t('Open a recurring deposit'), body: t('Save a fixed amount every month.') },
  'P1-22': { section: 'deposits', icon: 'file', route: 'accounts', title: t('Interest certificate'), body: t('Interest earned this financial year, for your tax return.') },
  'P1-21': { section: 'deposits', icon: 'receipt', route: 'accounts', title: t('TDS certificate (Form 16A)'), body: t('Tax deducted on your deposit interest.') },
  'P2-12': { section: 'deposits', icon: 'search', title: t('Check locker availability'), body: t('See whether a safe deposit locker is free at your branch.') },
  'P2-13': { section: 'deposits', icon: 'lock', title: t('Rent a safe deposit locker'), body: t('Apply for a locker at your branch.') },
  'P1-23': { section: 'help', icon: 'calendar', workflow: 'appointment', title: t('Book a branch visit'), body: t('Choose a branch, a date and a time that suits you.') },
  'P1-24': { section: 'help', icon: 'requests', route: 'requests', title: t('Track a request'), body: t('See where your requests have got to.') },
  'P2-14': { section: 'help', icon: 'headset', title: t('Raise a complaint'), body: t('A senior officer looks into it and replies to you.') },
  'P2-08': { section: 'help', icon: 'senior', title: t('Claim for a deceased account holder'), body: t('For family members and nominees.') },
});

/** A request's service in plain words, for request lists ("Open a savings account", not the internal catalogue name). */
export const serviceLabel = (t: T, serviceId?: string, fallback?: string) =>
  (serviceId && CATALOGUE(t)[serviceId]?.title) || (fallback ? humanizeCode(fallback) : t('Service request'));

