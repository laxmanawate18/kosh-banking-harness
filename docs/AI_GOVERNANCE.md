# Mitra: AI governance

Mitra is Kosh's AI assistant for visitors and signed-in customers. This page describes who owns it, how changes are approved, what is monitored and how customers are protected. Every control named here exists in the product; the officer console locations are given in brackets.

## 1. Ownership and review

| Role | Responsibility |
|---|---|
| **AI owner** (`AI_OWNER` setting, shown in [Operations → Mitra quality]) | Accountable for Mitra's behaviour; approves every prompt version before it goes live; chairs the quarterly review. |
| Compliance | Reviews the response rules (section 3), complaint and fraud scripts, and evaluation results each quarter. |
| Customer care | Works the [Customer care] queue: complaints, callbacks, fraud reports and hardship requests. |
| Engineering | Runs the evaluation set on every change and keeps the audit trail. |

**Quarterly review:** evaluation pass rate by category, withheld-reply and refusal rates, 👎 feedback themes, complaint volume and overdue cases, fairness results, and any incidents.

## 2. Change control

1. Everything that shapes Mitra's replies (instructions, language rules and skills) is hashed into a **prompt version**. The running version registers itself at startup, and every conversation turn records it.
2. Before release, run the evaluation set: `venv/bin/python tests/eval/run_eval.py --record`. It holds 107 cases across 16 categories, covering product facts, unknown information, rival banks, jailbreaks, prompt probing, fraud, complaints, handoff, distress, lending, investments, AI disclosure, off-topic requests, Hindi, Marathi and Hinglish, answer style, and fairness groups. The result is stored on that version.
3. **Release gate:** at least 95% overall, **100% on care_fraud, jailbreak and prompt_probe**, and every fairness group passing. The AI owner then approves the version in [Mitra quality → Prompt versions], with a note on what was reviewed.
4. **Rollback:** redeploy the previous image. Its prompt version is still in the registry with its evaluation and approval.

## 3. Response rules (enforced in code, then in instructions)

| Rule | How it is enforced |
|---|---|
| Stays Mitra; no role-play, persona or "developer mode" | Refused before the model sees the message (English, Hindi, Marathi) |
| Never reveals instructions, architecture or tools | Refused before the model; replies are checked for leaks |
| No rival-bank comparisons or claims | Replies naming another bank become a polite decline listing Kosh's own products (visitor and signed-in) |
| No unapproved rates, superlatives or approval promises | Visitor replies are checked against the published catalogue; unsafe sales phrases are blocked on both channels |
| "I don't have that information" instead of guessing | Instruction, plus a fallback that never repeats itself |
| Fraud emergency | A fixed script covering the 1930 helpline, cybercrime.gov.in, card freeze and RBI's 3-day reporting rule. It never goes through the model. Signed-in customers get a HIGH-priority fraud case opened. |
| Self-harm | The Tele-MANAS 14416 helpline is shown first; there is no selling |
| Distress or hardship | No selling in that chat, and offers are paused for 90 days; hardship requests are routed to care |
| Complaints | Mitra registers the complaint with a reference, gives the 30-day resolution timeline and the RBI Ombudsman path (cms.rbi.org.in), and sends an SMS |
| "Talk to a person" | The helpline plus a callback case (within 1 working day). Mitra never talks the customer out of it. |
| Responsible lending | EMI is checked against income (50% ceiling) before any loan pitch; the Key Fact Statement and APR are mentioned; approval is never promised |
| Investments and insurance | General information only; a market-risk note is appended; insurance is always optional |
| AI disclosure | Mitra introduces itself as an AI assistant; a notice sits under every chat box |
| Personalised offers | Only with separate marketing consent, KYC verified, frequency caps and suppression (see the offer engine) |

## 4. Monitoring ([Operations → Mitra quality])

Each turn records its channel, language, outcome (answered, withheld, refused, fraud script, error), the reason a reply was withheld, any care intents, latency and prompt version. **No message text is stored in this log.**

**Alert thresholds**, reviewed weekly:
- Withheld replies above 10%.
- Errors above 2%.
- p90 latency above 30 s.
- 👎 feedback above 15% of rated replies.
- Any overdue fraud case.

Customers can rate any reply 👍 or 👎. Negative ratings appear with the masked reply for review.

## 5. Data protection (DPDP Act 2023)

- **Retention:** chat transcripts and feedback are deleted after **90 days** (`CHAT_RETENTION_DAYS`); a daily job enforces this. A visitor's in-progress application details are removed from chat memory after 24 hours. The turn log (no text) is kept for 1 year.
- **Masking at rest:** PAN, Aadhaar, card and mobile numbers are masked before a transcript is stored. The live conversation is not affected.
- **Notice:** the chat box states that Mitra is an AI, that chats are kept for 90 days, and that customers must never share an OTP or PIN.
- **Purpose limitation:** personalised offers use customer data only with the separate marketing consent, which can be withdrawn in Settings.

## 6. Fairness

Fairness groups in the evaluation set ask the same need with different names, genders, religions and regions. All members must receive the same Kosh products. A failure blocks release.

## 7. Incidents

An incident is a wrong or harmful reply reaching a customer (a mis-sold product, a leaked instruction, wrong fraud guidance), or a failure in a care flow. The process:
1. Customer care logs it.
2. The AI owner decides within 1 working day whether to roll back.
3. Engineering adds the case to the evaluation set so it can't recur.
4. Compliance records it for the quarterly review and, where required, for regulatory reporting.

## 8. References

- RBI, *Framework for Responsible and Ethical Enablement of AI (FREE-AI)*, 2025.
- RBI Integrated Ombudsman Scheme 2021.
- RBI Charter of Customer Rights and Fair Practices Code.
- RBI circular on limiting customer liability in unauthorised electronic banking transactions.
- Digital Personal Data Protection Act 2023.
- SEBI (Investment Advisers) Regulations.
- IRDAI corporate agency rules.

These inform the design; they are not a certification of compliance.
