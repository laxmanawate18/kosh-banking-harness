const DISPLAY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Sentinel Sovereign Premier Savings/gi, 'Kosh Suvarna Premier Savings'],
  [/Sentinel Obsidian Metal Credit Card/gi, 'Kosh Vajra Metal Credit Card'],
  [/Sentinel Neo Unlimited Cashback Card/gi, 'Kosh Neo Cashback Credit Card'],
  [/Sentinel High-Yield Smart FD/gi, 'Kosh Vriddhi Smart FD'],
  [/Sentinel Express Instant Personal Loan/gi, 'Kosh Express Personal Loan'],
  [/Sentinel Green Home Loan/gi, 'Kosh Griha Green Home Loan'],
  [/Sentinel Alpha 3-in-1 Demat & Wealth/gi, 'Kosh Nivesh 3-in-1 Demat & Wealth'],
  [/Sentinel Digital Smart Savings/gi, 'Kosh Digital Smart Savings'],
  [/Sentinel AI (?:Banker|Assistant)/gi, 'Mitra'],
  [/SENTINEL ONBOARDING REWARD/gi, 'KOSH WELCOME REWARD'],
  [/SENTINEL_DECISION/gi, 'KAVACH_DECISION'],
  [/SENTINEL_DENIAL/gi, 'KAVACH_DENIAL'],
  [/Sentinel(?:'s|’s) approval dialog/gi, 'the Kavach approval dialog'],
  [/Sentinel blocked/gi, 'Kavach blocked'],
  [/Sentinel returned/gi, 'Kavach returned'],
  [/@sentinel\.bank\b/gi, '@kosh.bank'],
  [/\bSentinel\b/gi, 'Kosh'],
];

/** Convert legacy customer-facing copy while preserving internal IDs and API contracts. */
export const brandDisplayText = (value: unknown): string => {
  let text = String(value ?? '');
  for (const [pattern, replacement] of DISPLAY_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text;
};

export const brandAuditEvent = <T,>(event: T): T => {
  const source = event as Record<string, any>;
  return {
    ...source,
    event_type: brandDisplayText(source.event_type),
    summary: brandDisplayText(source.summary),
    actor: brandDisplayText(source.actor),
    resource: brandDisplayText(source.resource),
  } as T;
};
