"""Customer care in Mitra: complaints, callbacks, fraud emergencies and hardship, for visitors and customers.

Detection is deterministic (English, Hindi, Marathi, Hinglish) so safety never depends on the model:
  FRAUD       a fixed safety script replaces the model reply; signed-in customers get a fraud case opened
  SELF_HARM   a fixed helpline message comes first, then an empathetic, no-selling reply
  DISTRESS    no selling for this chat, offers paused 90 days, hardship options offered
  COMPLAINT   empathy, then register_complaint (reference, RBI timelines, Ombudsman path); no selling
  HUMAN       helpline plus request_callback; never talk the customer out of it

Timelines follow the RBI Integrated Ombudsman Scheme: a bank has 30 days to resolve a complaint; after that, or if
unhappy with the reply, the customer may complain to the RBI Ombudsman (cms.rbi.org.in).
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from persistence import CareCaseRecord, utc_dt

HELPLINE = "1800 000 5674"
DUE = {"GRIEVANCE": timedelta(days=30), "CALLBACK": timedelta(hours=24), "FRAUD": timedelta(hours=4), "HARDSHIP": timedelta(days=7)}
PRIORITY = {"FRAUD": "HIGH", "HARDSHIP": "HIGH"}
PREFIX = {"GRIEVANCE": "CMP", "CALLBACK": "CB", "FRAUD": "FRD", "HARDSHIP": "HRD"}
MOBILE = re.compile(r"^(?:\+?91)?[6-9]\d{9}$")

_I = re.IGNORECASE
PATTERNS = {
    "SELF_HARM": re.compile(r"suicid|kill myself|end my life|want to die|no reason to live|आत्महत्या|जान दे दूँ|मरना चाहत|जीव द्या", _I),
    "FRAUD": re.compile(
        r"\b(otp|pin|cvv|password|upi pin)\b.{0,40}\b(shared|gave|given|told|asked|asking|sent|called|calling)\b"
        r"|\b(shared|gave|given|told|sent)\b.{0,40}\b(otp|pin|cvv|password)\b"
        r"|\b(hacked|compromised)\b|\bunauthori[sz]ed\b|\bvictim of\b"
        r"|\b(scammed|defrauded|cheated|duped)\b|\b(scam|fraud|phishing)\s+(call|sms|message|link|happened|transaction|debit)"
        r"|\b(did ?n[o']?t|never)\s+(make|do|authori[sz]e)\s+(this|that|these|the|a)\s+(transaction|payment|debit)"
        r"|\bmoney\b.{0,30}\b(stolen|deducted without|debited without)"
        r"|\b(stole|stolen|steal|stealing)\b.{0,30}\b(money|funds|cash|account|card|savings)\b"
        r"|\b(card|wallet|phone|mobile)\b.{0,20}\b(stolen|stole)\b"
        r"|\b(it'?s|it is|this is|that is|was|got|been)\s+(a\s+)?(fraud|scam)\b"
        r"|\b(unknown|strange|suspicious|unrecogni[sz]ed)\s+(transaction|debit|payment|transfer)s?\b"
        r"|\b(entered|typed|gave|shared) (my )?(pin|otp|cvv|password|card details|card number|upi pin)\b"
        r"|\bclicked (on )?(a|an|the|that)? ?(sms |whatsapp |email )?link\b.{0,60}\b(pin|otp|password|card|kyc|bank)\b"
        r"|\b(anydesk|teamviewer|quick ?support|screen ?shar\w*)\b"
        r"|fraud ho gaya|paise (kat|nikal|chale) gaye|(maine|mene) (koi )?(transaction|payment) nahi kiya|otp (de|bata) diya|धोखाधड़ी|ठगी|फ्रॉड|फसवणूक|ओटीपी.{0,20}(दिया|बताया|माँगा|मांगा|दिला|सांगितला)", _I),
    "DISTRESS": re.compile(
        r"lost my job|job loss|laid off|layoff|lost (my|our) (income|business)|can'?t (pay|afford) (my |the )?(emi|loan|rent|bills?)"
        r"|unable to (pay|repay)|missed (my |an )?emi|passed away|\bdied\b|death in (my|the) family|medical emergency|hospitali[sz]ed"
        r"|debt trap|bankrupt|financial (crisis|trouble|hardship)|naukri chali|emi nahi bhar"
        r"|नौकरी (चली|छूट)|ईएमआई नहीं|कर्ज में डूब|नोकरी गेली|हप्ता भरू शकत नाही", _I),
    "COMPLAINT": re.compile(
        r"\bcomplain|\bgrievance|\bescalat|ombudsman|not (happy|satisfied) with|unhappy with|worst (bank|service)|pathetic"
        r"|(terrible|bad|poor) service|charged (me )?wrongly|wrong(ly)? charged|hidden charges?|refund (not|hasn'?t|has not)"
        r"|still not (received|resolved|refunded)|shikayat|takrar|शिकायत|तक्रार", _I),
    "HUMAN": re.compile(
        r"\b(talk|speak|connect|chat)\b.{0,12}\b(to|with)\b.{0,12}\b(a |an |the |some |real )?(human|person|agent|executive|representative"
        r"|someone|customer care|manager|officer|banker)\b|\bcall me\b|\bcall ?back\b|\breal person\b|\bhuman agent\b"
        r"|insaan se baat|किसी (इंसान|व्यक्ति) से बात|कॉल बैक|माणसाशी बोल", _I),
}
ORDER = ("SELF_HARM", "FRAUD", "DISTRESS", "COMPLAINT", "HUMAN")


def detect(prompt: str) -> List[str]:
    """Care intents in priority order (empty for ordinary banking questions)."""
    return [kind for kind in ORDER if PATTERNS[kind].search(prompt or "")]


TEXT: Dict[str, Dict[str, str]] = {
    "en": {
        "fraud": ("This could be fraud, so let's act quickly:\n"
                  "1. **Don't share** your OTP, PIN, CVV or passwords with anyone. Kosh will never ask for them.\n"
                  "2. {freeze}\n"
                  "3. **Report it to the National Cyber Crime Helpline 1930** or at cybercrime.gov.in right away. Quick reporting gives the best chance of stopping the money.\n"
                  "4. Call Kosh 24x7 on **" + HELPLINE + "** to block your card or account. Reporting to the bank within 3 working days protects you under RBI's customer-liability rules.\n"
                  "{case}"),
        "freeze_customer": "I can freeze your debit card right now: tap **Freeze my card** below.",
        "freeze_visitor": "If you bank with Kosh, sign in and freeze your card from Cards, or call us to block it.",
        "fraud_case": "I've opened fraud case **{ref}**; our fraud team will call you within 4 hours.",
        "self_harm": ("I'm really sorry you're going through this. You don't have to face it alone. Please call **Tele-MANAS on 14416** "
                      "(free, 24x7, Government of India) or 1-800-891-4416. If you are in immediate danger, call **112**."),
        "investment": "_Mutual funds and securities are subject to market risks; read all scheme documents carefully. This is general product information from Kosh, not investment advice._",
        "insurance": "_Insurance is optional and is never a condition for any Kosh loan or account. Read the policy terms before you buy._",
    },
    "hi": {
        "fraud": ("यह धोखाधड़ी हो सकती है, इसलिए तुरंत कदम उठाएँ:\n"
                  "1. अपना OTP, PIN, CVV या पासवर्ड **किसी से साझा न करें**। कोष कभी इन्हें नहीं माँगता।\n"
                  "2. {freeze}\n"
                  "3. तुरंत **राष्ट्रीय साइबर क्राइम हेल्पलाइन 1930** या cybercrime.gov.in पर शिकायत करें। जल्दी शिकायत से पैसा रुकने की संभावना सबसे अधिक होती है।\n"
                  "4. कार्ड या खाता ब्लॉक कराने के लिए कोष को 24x7 **" + HELPLINE + "** पर कॉल करें। 3 कार्य-दिवसों में बैंक को बताने से RBI के ग्राहक-दायित्व नियमों के तहत आपकी सुरक्षा होती है।\n"
                  "{case}"),
        "freeze_customer": "मैं अभी आपका डेबिट कार्ड फ़्रीज़ कर सकता हूँ: नीचे **Freeze my card** दबाएँ।",
        "freeze_visitor": "अगर आपका खाता कोष में है, तो साइन इन करके Cards से कार्ड फ़्रीज़ करें, या ब्लॉक कराने के लिए हमें कॉल करें।",
        "fraud_case": "मैंने धोखाधड़ी केस **{ref}** खोल दिया है; हमारी फ़्रॉड टीम 4 घंटे में आपको कॉल करेगी।",
        "self_harm": ("मुझे बहुत दुख है कि आप इससे गुज़र रहे हैं। आप अकेले नहीं हैं। कृपया **टेली-मानस 14416** (निःशुल्क, 24x7, भारत सरकार) "
                      "या 1-800-891-4416 पर कॉल करें। तुरंत ख़तरा हो तो **112** पर कॉल करें।"),
        "investment": "_म्यूचुअल फ़ंड और प्रतिभूतियाँ बाज़ार जोखिमों के अधीन हैं; सभी योजना दस्तावेज़ ध्यान से पढ़ें। यह कोष की सामान्य प्रोडक्ट जानकारी है, निवेश सलाह नहीं।_",
        "insurance": "_बीमा वैकल्पिक है और कोष के किसी लोन या खाते की शर्त कभी नहीं है। ख़रीदने से पहले पॉलिसी की शर्तें पढ़ें।_",
    },
    "mr": {
        "fraud": ("ही फसवणूक असू शकते, त्यामुळे लगेच पावले उचला:\n"
                  "1. तुमचा OTP, PIN, CVV किंवा पासवर्ड **कोणालाही सांगू नका**. कोष ते कधीच विचारत नाही.\n"
                  "2. {freeze}\n"
                  "3. लगेच **राष्ट्रीय सायबर क्राइम हेल्पलाइन 1930** वर किंवा cybercrime.gov.in वर तक्रार करा. लवकर तक्रार केल्यास पैसे थांबण्याची शक्यता सर्वाधिक असते.\n"
                  "4. कार्ड किंवा खाते ब्लॉक करण्यासाठी कोषला 24x7 **" + HELPLINE + "** वर कॉल करा. 3 कामकाजाच्या दिवसांत बँकेला कळवल्यास RBI च्या ग्राहक-दायित्व नियमांनुसार तुमचे संरक्षण होते.\n"
                  "{case}"),
        "freeze_customer": "मी आत्ताच तुमचे डेबिट कार्ड फ्रीझ करू शकतो: खाली **Freeze my card** दाबा.",
        "freeze_visitor": "तुमचे खाते कोषमध्ये असल्यास, साइन इन करून Cards मधून कार्ड फ्रीझ करा, किंवा ब्लॉक करण्यासाठी आम्हाला कॉल करा.",
        "fraud_case": "मी फसवणूक केस **{ref}** उघडली आहे; आमची फ्रॉड टीम 4 तासांत तुम्हाला कॉल करेल.",
        "self_harm": ("तुम्ही यातून जात आहात याचे मला खूप वाईट वाटते. तुम्ही एकटे नाही. कृपया **टेली-मानस 14416** (मोफत, 24x7, भारत सरकार) "
                      "किंवा 1-800-891-4416 वर कॉल करा. तात्काळ धोका असल्यास **112** वर कॉल करा."),
        "investment": "_म्युच्युअल फंड आणि सिक्युरिटीज बाजारातील जोखमींच्या अधीन आहेत; सर्व योजना कागदपत्रे काळजीपूर्वक वाचा. ही कोषची सामान्य प्रॉडक्ट माहिती आहे, गुंतवणूक सल्ला नाही._",
        "insurance": "_विमा ऐच्छिक आहे आणि कोषच्या कोणत्याही कर्जाची किंवा खात्याची अट कधीच नसतो. खरेदीपूर्वी पॉलिसीच्या अटी वाचा._",
    },
}

DIRECTIVES = {
    "SELF_HARM": "The customer may be at risk of self-harm. A helpline message has already been shown. Be warm, calm and brief; do not mention any product or offer.",
    "DISTRESS": ("The customer may be in financial or personal distress. Be warm and brief. Do not mention, suggest or pitch any product, "
                 "offer or card. Explain the support Kosh can review: EMI restructuring or a payment-holiday request for loans, and "
                 "a review of charges. These are requests the bank reviews, never promises. Offer to register a hardship request "
                 "(register_complaint with category HARDSHIP) or a callback (request_callback)."),
    "COMPLAINT": ("The customer is raising a complaint. Do not sell or mention offers. Apologise sincerely in one line and restate the problem "
                  "in your own words. Ask only for missing details{visitor_details}, then call register_complaint and share the reference "
                  "it returns: Kosh acknowledges within 1 working day and resolves within 30 days, and if it is not resolved in 30 days or "
                  "the customer is unhappy with the reply, they can complain to the RBI Ombudsman at cms.rbi.org.in."),
    "HUMAN": ("The customer wants to speak to a person. Do not try to talk them out of it and do not sell. Give the 24x7 helpline "
              + HELPLINE + " and offer a callback; if they want one, call request_callback{visitor_details} and share the reference and timing."),
}


def text(key: str, language: str = "en") -> str:
    return TEXT.get(language, TEXT["en"]).get(key) or TEXT["en"][key]


def directive(intents: List[str], signed_in: bool) -> str:
    """Trusted instructions for the model for this turn's care intents (empty when there are none)."""
    details = "" if signed_in else " (for a visitor, ask only for their name and mobile number)"
    lines = [DIRECTIVES[i].format(visitor_details=details) for i in intents if i in DIRECTIVES]
    return ("CARE DIRECTIVE (trusted, from Kosh): " + " ".join(lines)) if lines else ""


_INVESTMENT = re.compile(r"mutual fund|\bsip\b|equit(y|ies)|stock market|\bshares\b|demat|nivesh|securities|म्यूचुअल|म्युच्युअल|डीमैट|शेयर", _I)
_INSURANCE = re.compile(r"insurance|\bloan shield\b|बीमा|विमा", _I)


def with_disclaimers(reply: str, language: str = "en") -> str:
    """Append the market-risk / optional-insurance notes when a reply talks about investments or insurance."""
    extra = []
    if _INVESTMENT.search(reply) and "not investment advice" not in reply and "निवेश सलाह नहीं" not in reply and "गुंतवणूक सल्ला नाही" not in reply:
        extra.append(text("investment", language))
    if _INSURANCE.search(reply) and "never a condition" not in reply and "शर्त कभी नहीं" not in reply and "अट कधीच" not in reply:
        extra.append(text("insurance", language))
    return reply + ("\n\n" + "\n\n".join(extra) if extra else "")


def _clean_phone(phone: Optional[str]) -> Optional[str]:
    digits = re.sub(r"[\s-]", "", phone or "")
    if not MOBILE.match(digits):
        return None
    return "+91" + digits[-10:]


def open_case(db, kind: str, summary: str, *, customer_id: Optional[str] = None, name: Optional[str] = None,
              phone: Optional[str] = None, category: Optional[str] = None, preferred_time: Optional[str] = None,
              session_id: Optional[str] = None) -> Dict[str, Any]:
    """Record a care case and text the customer its reference. Raises ValueError on missing details."""
    kind = kind.upper()
    if kind not in DUE:
        raise ValueError("Unknown case type")
    summary = " ".join((summary or "").split())[:1500]
    if len(summary) < 5:
        raise ValueError("Please describe the issue in a few words")
    mobile = _clean_phone(phone)
    if phone and not mobile:
        raise ValueError("Please share a valid 10-digit Indian mobile number")
    if not customer_id and not mobile:
        raise ValueError("A mobile number is needed so Kosh can contact you")
    now = utc_dt()
    case_id = f"{PREFIX[kind]}-{uuid.uuid4().hex[:8].upper()}"
    with db.runtime.sessions.begin() as s:
        s.add(CareCaseRecord(id=case_id, kind=kind, status="OPEN", priority=PRIORITY.get(kind, "NORMAL"), customer_id=customer_id,
                             session_id=session_id, name=(name or "")[:120] or None, phone=mobile, category=(category or kind)[:60],
                             summary=summary, preferred_time=(preferred_time or "")[:80] or None, due_at=now + DUE[kind]))
    from backend.notifications import notify, phone_for
    notify(db, "care_case_registered", mobile or phone_for(db, customer_id), customer_id=customer_id, reference=case_id,
           kind={"GRIEVANCE": "complaint", "CALLBACK": "callback request", "FRAUD": "fraud report", "HARDSHIP": "hardship request"}[kind],
           next={"GRIEVANCE": "We reply within 30 days", "CALLBACK": "We will call you within 1 working day",
                 "FRAUD": "Our fraud team will call you within 4 hours", "HARDSHIP": "We review it within 7 days"}[kind])
    return {"reference": case_id, "kind": kind, "status": "OPEN", "due_by": (now + DUE[kind]).isoformat()}


def _row(r: CareCaseRecord) -> Dict[str, Any]:
    mask = (lambda n: n[:3] + "•" * (len(n) - 7) + n[-4:]) if r.phone else (lambda n: None)
    return {"id": r.id, "kind": r.kind, "status": r.status, "priority": r.priority, "customer_id": r.customer_id, "name": r.name,
            "phone": mask(r.phone) if r.phone else None, "category": r.category, "summary": r.summary, "preferred_time": r.preferred_time,
            "resolution": r.resolution, "due_at": r.due_at.isoformat(), "created_at": r.created_at.isoformat(),
            "overdue": r.status in {"OPEN", "IN_PROGRESS"} and (r.due_at if r.due_at.tzinfo else r.due_at.replace(tzinfo=timezone.utc)) < datetime.now(timezone.utc)}


def list_cases(db, status: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]:
    with db.runtime.sessions() as s:
        q = select(CareCaseRecord).order_by(CareCaseRecord.created_at.desc()).limit(limit)
        if status:
            q = q.where(CareCaseRecord.status == status)
        return [_row(r) for r in s.scalars(q)]


def update_case(db, case_id: str, status: str, resolution: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if status not in {"OPEN", "IN_PROGRESS", "RESOLVED", "ESCALATED"}:
        raise ValueError("Unknown status")
    with db.runtime.sessions.begin() as s:
        row = s.get(CareCaseRecord, case_id)
        if not row:
            return None
        row.status, row.updated_at = status, utc_dt()
        if resolution:
            row.resolution = resolution[:2000]
        return _row(row)


def pause_offers(db, customer_id: Optional[str], days: int = 90) -> None:
    """No personalised offers for a customer who told us they are in distress (every channel, 90 days)."""
    if not customer_id:
        return
    until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

    def mutate(state):
        state.setdefault("preferences", {}).setdefault(customer_id, {})["offers_paused_until"] = until
    db.transaction(mutate)
