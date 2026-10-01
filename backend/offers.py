"""Next-best offer for a signed-in customer, with offer governance and a conversion funnel.

Engine: each rule reads the customer's own banking data (salary credits, idle savings, spending, holdings,
payees, KYC) and, if it fits, proposes one catalogue product with a plain reason the customer can check.

Governance, applied to every channel (dashboard and Mitra):
  * marketing consent is a separate purpose (Settings > "Personalised offers"); without it nothing is pushed
  * no offers until initial KYC is verified
  * suppressed if the customer already holds the product type, has an open lead/application for it,
    dismissed it in the last 90 days, or was declined for it in the last 180 days
  * frequency caps: a product rests for 30 days after being shown on 3 days without a click; the dashboard
    shows at most 2 offers, Mitra proactively pitches at most 1 offer a day

Funnel: SHOWN -> CLICKED -> APPLIED (a CRM lead, or an instant-product form) -> APPROVED (lead approved by an officer,
or the instant product actually opened).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from persistence import CrossSellLeadRecord, OfferEventRecord
from product_service import get_product_by_id, inr

CHANNELS = {"DASHBOARD", "MITRA"}
DISMISS_REST_DAYS = 90
DECLINE_REST_DAYS = 180
CAP_WINDOW_DAYS, CAP_SHOWN_DAYS = 30, 3
DASHBOARD_MAX, MITRA_DAILY_MAX = 2, 1
OPEN_LEAD_STATUSES = {"DISCOVERY", "QUALIFIED", "INTERESTED", "APPLIED", "PENDING_REVIEW"}
APPROVED_LEAD_STATUSES = {"APPROVED", "CONVERTED"}
EVERYDAY = {"GROCERIES", "ENTERTAINMENT", "SHOPPING", "DINING", "FOOD", "UTILITIES", "FUEL", "TRAVEL"}
LEAD_CATEGORY = {"cards": "CARD", "loans": "LOAN", "deposits": "DEPOSIT", "wealth": "WEALTH", "savings": "SAVINGS"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _when(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def signals(state: Dict[str, Any], customer_id: str) -> Dict[str, Any]:
    """Facts about the customer that offers may use. Only the customer's own records are read."""
    since = _now() - timedelta(days=45)
    accounts = [a for a in state.get("accounts", {}).values() if a.get("customer_id") == customer_id and a.get("status") == "ACTIVE"]
    txns = [t for t in state.get("transactions", []) if t.get("customer_id") == customer_id and t.get("status") == "COMPLETED"
            and _when(t["created_at"]) >= since]
    salary = max((t["amount_minor"] for t in txns if t.get("category") == "SALARY" and t["amount_minor"] > 0), default=0)
    everyday = -sum(t["amount_minor"] for t in txns if t["amount_minor"] < 0 and (t.get("category") or "").upper() in EVERYDAY)
    types = {a.get("type", "") for a in accounts}
    cards = {c.get("type") for c in state.get("cards", {}).values() if c.get("customer_id") == customer_id}
    payees = [b for b in state.get("beneficiaries", {}).values() if b.get("customer_id") == customer_id]
    kyc = ((state.get("customers", {}).get(customer_id) or {}).get("kyc") or {}).get("status", "VERIFIED")
    return {
        "monthly_salary_minor": salary,
        "savings_minor": sum(a.get("available_balance_minor", 0) for a in accounts if a.get("type") == "SAVINGS"),
        "total_balance_minor": sum(a.get("balance_minor", 0) for a in accounts),
        "everyday_spend_minor": everyday,
        "has_deposit": bool({"FIXED_DEPOSIT", "RECURRING_DEPOSIT"} & types),
        "has_loan": any("LOAN" in t for t in types),
        "has_credit_card": "CREDIT" in cards,
        "pays_rent": any("rent" in (b.get("display_name", "") + b.get("relationship", "")).lower() for b in payees),
        "kyc_verified": kyc in {"VERIFIED", "PENDING_RE_KYC"},  # periodic re-KYC due still means verified once
    }


REASONS: Dict[str, Dict[str, str]] = {
    "IDLE_SAVINGS": {
        "en": "About {surplus} sits in savings beyond two months of your spending. In a Vriddhi FD at 8.10% p.a. it could earn about {yearly} a year.",
        "hi": "आपकी दो महीने की ख़र्च की ज़रूरत से ऊपर लगभग {surplus} सेविंग्स में पड़ा है। 8.10% सालाना वाली Vriddhi FD में यह साल में लगभग {yearly} कमा सकता है।",
        "mr": "तुमच्या दोन महिन्यांच्या खर्चापेक्षा जास्त सुमारे {surplus} बचत खात्यात आहेत. 8.10% वार्षिक Vriddhi FD मध्ये ते वर्षाला सुमारे {yearly} कमवू शकतात."},
    "HIGH_SALARY_NO_CARD": {
        "en": "Your salary credits of {salary} a month fit our Vajra metal card: 5X rewards, unlimited lounge access and a 1.5% forex markup.",
        "hi": "हर महीने {salary} की सैलरी के हिसाब से हमारा Vajra मेटल कार्ड आपके लिए सही है: 5X रिवॉर्ड, अनलिमिटेड लाउंज एक्सेस और 1.5% फ़ॉरेक्स मार्कअप।",
        "mr": "दरमहा {salary} पगारानुसार आमचे Vajra मेटल कार्ड तुमच्यासाठी योग्य आहे: 5X रिवॉर्ड, अमर्यादित लाउंज प्रवेश आणि 1.5% फॉरेक्स मार्कअप."},
    "EVERYDAY_SPEND_NO_CARD": {
        "en": "You spent {spend} on groceries, bills and entertainment recently. With the lifetime-free Neo card, 5% back would have been about {back}.",
        "hi": "हाल में आपने किराना, बिल और मनोरंजन पर {spend} ख़र्च किए। लाइफ़टाइम-फ़्री Neo कार्ड से 5% वापसी लगभग {back} होती।",
        "mr": "अलीकडे तुम्ही किराणा, बिले आणि मनोरंजनावर {spend} खर्च केले. आयुष्यभर मोफत Neo कार्डवर 5% परतावा सुमारे {back} झाला असता."},
    "RENT_PAYER": {
        "en": "You pay rent every month from Kosh. With your salary, a Griha home loan at 8.35% p.a. could turn that rent into your own home. Eligibility is subject to a credit check.",
        "hi": "आप हर महीने कोष से किराया भरते हैं। आपकी सैलरी के साथ 8.35% सालाना वाला Griha होम लोन वह किराया आपके अपने घर में बदल सकता है। पात्रता क्रेडिट जाँच पर निर्भर है।",
        "mr": "तुम्ही दरमहा कोषमधून भाडे भरता. तुमच्या पगारासह 8.35% वार्षिक Griha गृहकर्ज ते भाडे तुमच्या स्वतःच्या घरात बदलू शकते. पात्रता क्रेडिट तपासणीवर अवलंबून आहे."},
    "DIVERSIFY": {
        "en": "You hold {total} in savings and deposits. A Nivesh demat account with zero brokerage lets you diversify into mutual funds and bonds.",
        "hi": "आपके पास सेविंग्स और डिपॉज़िट में {total} हैं। ज़ीरो ब्रोकरेज वाला Nivesh डीमैट खाता म्यूचुअल फ़ंड और बॉन्ड में विविधता लाने देता है।",
        "mr": "तुमच्याकडे बचत आणि ठेवींमध्ये {total} आहेत. शून्य ब्रोकरेज असलेले Nivesh डीमॅट खाते म्युच्युअल फंड आणि बाँडमध्ये विविधता आणू देते."},
}


def _reason(code: str, language: str, **params: str) -> str:
    return REASONS[code].get(language, REASONS[code]["en"]).format(**params)


def _candidates(s: Dict[str, Any], language: str = "en") -> List[Dict[str, Any]]:
    """Rules, most useful first. score: rough customer value, used only for ordering."""
    out = []
    buffer = max(s["everyday_spend_minor"] * 2, 5_000_000)  # keep 2 months of spending (min ₹50,000) liquid
    surplus = s["savings_minor"] - buffer
    if not s["has_deposit"] and surplus >= 10_000_000:
        yearly = int(surplus * 0.081)
        out.append({"product_id": "PROD-FD-SMART", "reason_code": "IDLE_SAVINGS", "score": yearly,
                    "reason": _reason("IDLE_SAVINGS", language, surplus=inr(surplus / 100), yearly=inr(yearly / 100))})
    if not s["has_credit_card"] and s["monthly_salary_minor"] >= 15_000_000:
        out.append({"product_id": "PROD-CARD-OBSIDIAN", "reason_code": "HIGH_SALARY_NO_CARD", "score": s["monthly_salary_minor"] // 20,
                    "reason": _reason("HIGH_SALARY_NO_CARD", language, salary=inr(s["monthly_salary_minor"] / 100))})
    elif not s["has_credit_card"] and s["monthly_salary_minor"] >= 2_500_000 and s["everyday_spend_minor"] >= 500_000:
        back = s["everyday_spend_minor"] * 5 // 100
        out.append({"product_id": "PROD-CARD-CASHBACK", "reason_code": "EVERYDAY_SPEND_NO_CARD", "score": back * 12,
                    "reason": _reason("EVERYDAY_SPEND_NO_CARD", language, spend=inr(s["everyday_spend_minor"] / 100), back=inr(back / 100))})
    if not s["has_loan"] and s["pays_rent"] and s["monthly_salary_minor"] >= 10_000_000:
        out.append({"product_id": "PROD-LOAN-HOME", "reason_code": "RENT_PAYER", "score": s["monthly_salary_minor"] // 50,
                    "reason": _reason("RENT_PAYER", language)})
    if s["has_deposit"] and s["total_balance_minor"] >= 100_000_000:
        out.append({"product_id": "PROD-WEALTH-ALPHA", "reason_code": "DIVERSIFY", "score": s["total_balance_minor"] // 1000,
                    "reason": _reason("DIVERSIFY", language, total=inr(s["total_balance_minor"] / 100))})
    return sorted(out, key=lambda o: -o["score"])


def _record(session, customer_id: str, product_id: str, channel: str, event: str,
            reason_code: Optional[str] = None, reference: Optional[str] = None) -> None:
    session.add(OfferEventRecord(id=f"OFR-{uuid.uuid4().hex[:16].upper()}", customer_id=customer_id, product_id=product_id,
                                 channel=channel, event=event, reason_code=reason_code, reference=reference))


def consented(state: Dict[str, Any], customer_id: str) -> bool:
    return bool((state.get("preferences", {}).get(customer_id) or {}).get("marketing_offers"))


def marketing_block(state: Dict[str, Any], customer_id: str) -> Optional[str]:
    """Why this customer may not be marketed to right now (no marketing consent, offers paused for hardship), or None."""
    if not consented(state, customer_id):
        return "MARKETING_CONSENT_REQUIRED"
    paused = (state.get("preferences", {}).get(customer_id) or {}).get("offers_paused_until")
    return "PAUSED_FOR_HARDSHIP" if paused and paused > _now().isoformat() else None


def _suppressed(session, customer_id: str, product_id: str, category: str) -> Optional[str]:
    now = _now()
    events = session.scalars(select(OfferEventRecord).where(OfferEventRecord.customer_id == customer_id,
                                                            OfferEventRecord.product_id == product_id,
                                                            OfferEventRecord.created_at >= now - timedelta(days=DISMISS_REST_DAYS))).all()
    if any(e.event == "DISMISSED" for e in events):
        return "DISMISSED"
    leads = session.scalars(select(CrossSellLeadRecord).where(CrossSellLeadRecord.customer_id == customer_id)).all()
    for lead in leads:
        same = lead.recommended_product_id == product_id or lead.category == LEAD_CATEGORY.get(category)
        if same and lead.status in OPEN_LEAD_STATUSES:
            return "OPEN_APPLICATION"
        if same and lead.status in {"REJECTED", "DECLINED"} and _aware(lead.updated_at) >= now - timedelta(days=DECLINE_REST_DAYS):
            return "RECENTLY_DECLINED"
    window = [e for e in events if _aware(e.created_at) >= now - timedelta(days=CAP_WINDOW_DAYS)]
    shown_days = {_aware(e.created_at).date() for e in window if e.event == "SHOWN"}
    if len(shown_days) >= CAP_SHOWN_DAYS and not any(e.event in {"CLICKED", "APPLIED"} for e in window):
        return "FREQUENCY_CAP"
    return None


def next_best_offers(db, customer_id: str, channel: str, *, record: bool = True, language: str = "en") -> Dict[str, Any]:
    """Eligible offers for this customer on this channel, after governance. Records SHOWN once per day."""
    state = db.snapshot()
    blocked = marketing_block(state, customer_id)
    if blocked:
        return {"offers": [], "blocked": blocked}
    facts = signals(state, customer_id)
    if not facts["kyc_verified"]:
        return {"offers": [], "blocked": "KYC_NOT_VERIFIED"}
    today = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    limit = DASHBOARD_MAX if channel == "DASHBOARD" else MITRA_DAILY_MAX
    with db.runtime.sessions.begin() as session:
        shown_today = session.scalars(select(OfferEventRecord).where(OfferEventRecord.customer_id == customer_id,
                                                                     OfferEventRecord.channel == channel,
                                                                     OfferEventRecord.event == "SHOWN",
                                                                     OfferEventRecord.created_at >= today)).all()
        if channel == "MITRA" and len({e.product_id for e in shown_today}) >= MITRA_DAILY_MAX:
            return {"offers": [], "blocked": "DAILY_CAP"}
        offers = []
        for candidate in _candidates(facts, language):
            product = get_product_by_id(candidate["product_id"])
            if not product or _suppressed(session, customer_id, product["id"], product["category"]):
                continue
            offers.append({**candidate, "title": product["title"], "headline_rate": product["headline_rate"],
                           "badge": product.get("badge", ""), "category": product["category"], "features": product["features"][:3]})
            if len(offers) == limit:
                break
        if record:
            already = {e.product_id for e in shown_today}
            for offer in offers:
                if offer["product_id"] not in already:
                    _record(session, customer_id, offer["product_id"], channel, "SHOWN", offer["reason_code"])
    for offer in offers:
        offer.pop("score")
    return {"offers": offers, "blocked": None}


def record_event(db, customer_id: str, product_id: str, channel: str, event: str, reference: Optional[str] = None) -> None:
    with db.runtime.sessions.begin() as session:
        _record(session, customer_id, product_id, channel, event, reference=reference)


def attribute_lead(db, customer_id: Optional[str], product_id: Optional[str], lead_id: str, channel: str = "MITRA") -> bool:
    """A lead for a product the customer was offered in the last 30 days counts as that offer's application."""
    if not customer_id or not product_id:
        return False
    with db.runtime.sessions.begin() as session:
        shown = session.scalar(select(OfferEventRecord.id).where(
            OfferEventRecord.customer_id == customer_id, OfferEventRecord.product_id == product_id, OfferEventRecord.event == "SHOWN",
            OfferEventRecord.created_at >= _now() - timedelta(days=CAP_WINDOW_DAYS)).limit(1))
        applied = session.scalar(select(OfferEventRecord.id).where(OfferEventRecord.reference == lead_id, OfferEventRecord.event == "APPLIED"))
        if not shown or applied:
            return False
        _record(session, customer_id, product_id, channel, "APPLIED", reference=lead_id)
        return True


INSTANT_PRODUCTS = {"PROD-FD-SMART": "deposit"}  # opened straight-through by the customer; no officer lead needed


def record_conversion(db, customer_id: str, product_id: str, reference: str) -> bool:
    """The customer completed the product itself (e.g. an instant FD) within 30 days of applying from an offer."""
    with db.runtime.sessions.begin() as session:
        applied = session.scalar(select(OfferEventRecord.channel).where(
            OfferEventRecord.customer_id == customer_id, OfferEventRecord.product_id == product_id, OfferEventRecord.event == "APPLIED",
            OfferEventRecord.created_at >= _now() - timedelta(days=CAP_WINDOW_DAYS)).order_by(OfferEventRecord.created_at.desc()).limit(1))
        if not applied:
            return False
        _record(session, customer_id, product_id, applied, "CONVERTED", reference=reference)
        return True


def funnel(db, days: int = 30) -> Dict[str, Any]:
    """Distinct customers at each stage, per product and channel. APPROVED = an officer approved the offer's lead."""
    since = _now() - timedelta(days=days)
    with db.runtime.sessions() as session:
        events = session.scalars(select(OfferEventRecord).where(OfferEventRecord.created_at >= since)).all()
        lead_ids = {e.reference for e in events if e.event == "APPLIED" and e.reference}
        approved = {r.id for r in session.scalars(select(CrossSellLeadRecord).where(CrossSellLeadRecord.id.in_(lead_ids)))
                    if r.status in APPROVED_LEAD_STATUSES} if lead_ids else set()
    rows: Dict[tuple, Dict[str, set]] = {}
    for e in events:
        stages = rows.setdefault((e.product_id, e.channel), {k: set() for k in ("SHOWN", "CLICKED", "APPLIED", "APPROVED", "DISMISSED")})
        stages["APPROVED" if e.event == "CONVERTED" else e.event].add(e.customer_id)
        if e.event == "APPLIED":
            stages["CLICKED"].add(e.customer_id)  # applying implies interest, so the funnel never narrows upwards
            if e.reference in approved:
                stages["APPROVED"].add(e.customer_id)
    rate = lambda a, b: round(100 * a / b, 1) if b else 0.0
    out = []
    for (product_id, channel), st in sorted(rows.items()):
        n = {k: len(v) for k, v in st.items()}
        out.append({"product_id": product_id, "title": (get_product_by_id(product_id) or {}).get("title", product_id), "channel": channel,
                    **{k.lower(): v for k, v in n.items()},
                    "click_rate": rate(n["CLICKED"], n["SHOWN"]), "apply_rate": rate(n["APPLIED"], n["CLICKED"]),
                    "approval_rate": rate(n["APPROVED"], n["APPLIED"]), "conversion_rate": rate(n["APPROVED"], n["SHOWN"])})
    totals = {k: sum(r[k] for r in out) for k in ("shown", "clicked", "applied", "approved", "dismissed")}
    return {"days": days, "rows": out, "totals": {**totals, "conversion_rate": rate(totals["approved"], totals["shown"])}}
