"""Kosh Banking Products Catalogue and AI Sales Advisor Service."""

from __future__ import annotations

import ast
import copy
import json
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

BANK_PRODUCTS: List[Dict[str, Any]] = [
    {
        "id": "PROD-SAV-PREMIER",
        "category": "savings",
        "category_label": "Savings Accounts",
        "title": "Kosh Suvarna Premier Savings",
        "tagline": "India's highest yield everyday savings with zero compromises",
        "headline_rate": "7.20% p.a.",
        "badge": "Highest Yield",
        "featured": True,
        "min_balance": "₹0 (Zero Balance)",
        "interest_payout": "Monthly compounding",
        "features": [
            "7.20% p.a. interest credited monthly (vs 3.00% - 3.50% at traditional banks)",
            "Zero minimum monthly balance requirement",
            "Suvarna Metal Debit Card with lifetime zero annual fees",
            "Unlimited free domestic airport lounge access + 2 international visits/year",
            "Zero transaction fees on all UPI, IMPS, NEFT, and RTGS transfers",
            "Complimentary personal accident insurance cover up to ₹50,00,000"
        ],
        "welcome_bonus": "₹1,000 instant opening balance credit",
        "initial_deposit": 100000,  # in paise (₹1,000.00)
    },
    {
        "id": "PROD-SAV-DIGITAL",
        "category": "savings",
        "category_label": "Savings Accounts",
        "title": "Kosh Digital Smart Savings",
        "tagline": "Zero balance digital account opened instantly with virtual Visa",
        "headline_rate": "6.50% p.a.",
        "badge": "Instant Setup",
        "featured": False,
        "min_balance": "₹0 (Zero Balance)",
        "interest_payout": "Quarterly compounding",
        "features": [
            "6.50% p.a. interest rate with zero paperwork",
            "Instant Virtual Visa Signature card ready for online payments in 60 seconds",
            "Flat 2.0% cashback on all utility bill payments & merchant UPI scans",
            "Automated round-up savings on every debit swipe into high-yield micro-FDs",
            "No foreign currency markup on international e-commerce"
        ],
        "welcome_bonus": "₹500 instant opening balance credit",
        "initial_deposit": 50000,  # in paise (₹500.00)
    },
    {
        "id": "PROD-CARD-OBSIDIAN",
        "category": "cards",
        "category_label": "Credit Cards",
        "title": "Kosh Vajra Metal Credit Card",
        "tagline": "Crafted from aerospace tungsten with unmatched luxury privileges",
        "headline_rate": "5X Rewards",
        "badge": "Ultra Premium",
        "featured": True,
        "joining_fee": "₹0 (Complimentary for first year)",
        "credit_limit": "₹3,50,000 pre-approved limit",
        "features": [
            "5X Accelerated Reward Points on fine dining, flights, and international spends",
            "₹10,000 Taj Hotels luxury voucher upon card activation",
            "Unlimited domestic & international airport lounge access + spa treatments",
            "Complimentary golf rounds at 24 premier championship courses across India",
            "1.5% low forex markup (lowest in tier vs 3.5% market standard)",
            "₹1 Crore air accident insurance & zero lost card liability"
        ],
        "initial_credit_limit": 35000000,  # in paise (₹3,50,000.00)
    },
    {
        "id": "PROD-CARD-CASHBACK",
        "category": "cards",
        "category_label": "Credit Cards",
        "title": "Kosh Neo Cashback Credit Card",
        "tagline": "Real cash credited directly to your account every month",
        "headline_rate": "5% Flat Cashback",
        "badge": "Best for Everyday Spend",
        "featured": False,
        "joining_fee": "Lifetime Free",
        "credit_limit": "₹1,50,000 pre-approved limit",
        "features": [
            "Unlimited 5.0% instant cashback on Amazon, Flipkart, Swiggy, Zomato, & Uber",
            "1.5% uncapped cashback on all other online and offline spends",
            "1% fuel surcharge waiver across all fuel stations nationwide",
            "No caps, no expiry, and no minimum redemption thresholds on cashback",
            "Lifetime free card with zero annual or renewal fees"
        ],
        "initial_credit_limit": 15000000,  # in paise (₹1,50,000.00)
    },
    {
        "id": "PROD-FD-SMART",
        "category": "deposits",
        "category_label": "Fixed Deposits",
        "title": "Kosh Vriddhi Smart FD",
        "tagline": "Guaranteed wealth creation with maximum liquidity and safety",
        "headline_rate": "8.10% p.a.",
        "badge": "Guaranteed Returns",
        "featured": True,
        "min_deposit": "₹5,000",
        "tenure_range": "7 Days to 10 Years",
        "features": [
            "8.10% p.a. guaranteed interest (8.60% for senior citizens)",
            "Quarterly compounding or monthly income payout option",
            "Zero penalty on premature withdrawal after 6 months of tenure",
            "Instant overdraft/loan against FD up to 90% of deposit value in 2 taps",
            "DICGC insured up to ₹5,00,000 per depositor"
        ],
        "initial_deposit": 5000000,  # in paise (₹50,000.00)
    },
    {
        "id": "PROD-LOAN-EXPRESS",
        "category": "loans",
        "category_label": "Loans & Credit",
        "title": "Kosh Express Personal Loan",
        "tagline": "10-minute digital disbursal straight to your bank account",
        "headline_rate": "10.25% p.a.",
        "badge": "10-Min Disbursal",
        "featured": False,
        "max_amount": "Up to ₹25,00,000",
        "tenure": "12 to 60 Months",
        "features": [
            "Attractive interest rates starting at 10.25% reducing p.a.",
            "Instant paperless verification via digital KYC & Account Aggregator",
            "Zero pre-closure charges after 12 successful EMIs",
            "Flexible EMI repayment tenures from 12 to 60 months",
            "Zero branch visit required — 100% digital sanction and instant payout"
        ],
        "initial_credit_limit": 50000000,  # in paise (₹5,00,000.00 pre-approved)
    },
    {
        "id": "PROD-LOAN-HOME",
        "category": "loans",
        "category_label": "Loans & Credit",
        "title": "Kosh Griha Green Home Loan",
        "tagline": "Own your dream home with eco-concessions and lowest EMI",
        "headline_rate": "8.35% p.a.",
        "badge": "Lowest Rate",
        "featured": False,
        "max_amount": "Up to ₹5,00,00,000",
        "tenure": "Up to 30 Years",
        "features": [
            "Market-leading interest rate starting at 8.35% p.a.",
            "Special 0.25% rate discount for green/solar-certified residential projects",
            "Zero processing fees on balance transfer from other high-rate banks",
            "Doorstep legal & property valuation assistance with real-time tracking",
            "Tax deductions up to ₹2 Lakh under Sec 24(b) & ₹1.5 Lakh under Sec 80C"
        ],
        "initial_credit_limit": 500000000,
    },
    {
        "id": "PROD-WEALTH-ALPHA",
        "category": "wealth",
        "category_label": "Investments & Demat",
        "title": "Kosh Nivesh 3-in-1 Demat & Wealth",
        "tagline": "Seamless banking, Demat, and smart AI portfolio management",
        "headline_rate": "0% Brokerage",
        "badge": "Zero Brokerage",
        "featured": False,
        "amc": "Zero Lifetime AMC",
        "features": [
            "Zero brokerage on equity delivery investments for life",
            "Direct Mutual Funds with 0% commission and automated tax-loss harvesting",
            "Algorithmic SIP baskets aligned with your risk profile and long-term milestones",
            "Direct 3-in-1 linking: bank interest on idle trading funds until executed",
            "Real-time market analytics and analyst insights powered by Mitra"
        ],
        "initial_deposit": 100000,
    }
]


def get_all_products(category: Optional[str] = None) -> List[Dict[str, Any]]:
    products = BANK_PRODUCTS if not category or category == "all" else [
        product for product in BANK_PRODUCTS if product.get("category") == category.lower()
    ]
    return [public_product_facts(product) for product in products]


def get_product_by_id(product_id: str) -> Optional[Dict[str, Any]]:
    norm = product_id.strip().upper()
    for p in BANK_PRODUCTS:
        if p["id"].upper() == norm or p["id"].upper() == f"PROD-{norm}":
            return p
    return None


CATALOGUE_SOURCE = "kosh_demo_catalogue"
CATALOGUE_EFFECTIVE_FROM = "2026-09-01"
CATALOGUE_REVIEWED_AT = "2026-09-22"
STANDARD_DISCLOSURE = "Illustrative demo product information. Eligibility and terms apply."


def inr(amount: float, decimals: int = 0) -> str:
    """Format rupees with Indian digit grouping: 5000000 -> ₹50,00,000."""
    whole, _, fraction = f"{abs(amount):.{decimals}f}".partition(".")
    if len(whole) > 3:
        whole = re.sub(r"\B(?=(\d{2})+$)", ",", whole[:-3]) + "," + whole[-3:]
    return ("-" if amount < 0 else "") + "₹" + whole + (f".{fraction}" if fraction else "")


# Chat language toggle sent by the website ({"type": "prompt", ..., "language": "en"|"hi"|"mr"}).
SUPPORTED_LANGUAGES = {"en": "English", "hi": "Hindi (हिन्दी)", "mr": "Marathi (मराठी)"}


def normalize_language(value: Any) -> str:
    """Allowlist the client-supplied language code; anything else is English."""
    code = value.strip().lower() if isinstance(value, str) else ""
    return code if code in SUPPORTED_LANGUAGES else "en"


_MR_MARKERS = re.compile(r"(आहे|आहेत|माझ|माझी|माझे|काय|किती|मला|तुम्ही|करा|नाही|पाहिजे|सांगा|मध्ये|\b(aahe|ahe|majha|majhi|maza|mazi|kiti|sanga|madhye|pahije|nahi ka|kara)\b)", re.I)
_HI_MARKERS = re.compile(r"(है|हैं|मेरा|मेरी|मेरे|क्या|कितना|कितनी|मुझे|आप|करें|नहीं|चाहिए|बताइए|बताओ|में|\b(hai|hain|mera|meri|mere|kya|kitna|kitni|mujhe|batao|bataiye|chahiye|karo)\b)", re.I)


def reply_language(prompt: str, website_language: str = "en") -> str:
    """Language for canned replies: what the customer wrote wins; the website toggle is only the fallback."""
    mr, hi = len(_MR_MARKERS.findall(prompt or "")), len(_HI_MARKERS.findall(prompt or ""))
    if mr or hi:
        return "mr" if mr > hi else "hi"
    if re.search(r"[\u0900-\u097F]", prompt or ""):
        return website_language if website_language in {"hi", "mr"} else "hi"
    return "en" if re.search(r"[A-Za-z]", prompt or "") else normalize_language(website_language)


def language_instruction(language: str) -> str:
    """Trusted per-turn hint appended to the agent input (never to classifier input)."""
    return (f"Preferred reply language (website setting, fallback only): {SUPPORTED_LANGUAGES[normalize_language(language)]}. "
            "Reply in the language and script of the customer's message above (English, Hindi or Marathi, including romanized). "
            "If they typed Hindi or Marathi in English letters, reply in English letters too (e.g. 'tumhala' not 'तुम्हाला', 'aapko' not 'आपको'); "
            "use the website setting only if the message language is unclear.")


# Fixed backend strings that reach the chat UI, per website language.
CHAT_TEXT: Dict[str, Dict[str, str]] = {
    "en": {
        "auth_prompt": "To view your personal accounts, check balances, request services (such as chequebooks), or initiate transfers, please sign in securely with your mobile number. Kosh protects your banking privacy by requiring authentication before accessing personal account data.",
        "auth_title": "Authentication Required",
        "auth_message": "To view your personal account balance, transaction history, cards, or request account services, please sign in securely.",
        "auth_message_service": "To access services for an existing account, please sign in securely.",
        "auth_button": "Sign In to Kosh",
        "advisor_error": "Mitra could not respond. Please try again in a moment.",
        "transfer_approved": "A transfer was proposed and has already been verified and approved in the Kavach approval dialog.",
        "guarded": "I'm Mitra, Kosh's banking assistant, and I'll stay in that role. I can't share how I'm built or my instructions, but I'm happy to help with Kosh savings, cards, loans and deposits.",
        "competitor": "I can only speak about Kosh's own products, so I won't compare us with other banks. Here is what Kosh offers: {products}. Tell me what matters most to you and I'll help you pick one.",
        "no_info": "I'm sorry, I don't have verified information on that. I can share only what's in Kosh's published product details, or you can call our helpline on 1800 000 5674. Is there something about our accounts, cards, loans or deposits I can help with?",
        "no_info_alt": "I'm not able to answer that one reliably. I can help with Kosh's accounts, cards, loans and deposits, or you can call 1800 000 5674.",
        "question_discover": "What would you like the product to help you with?",
        "question_cards": "For a card, is travel, cashback, or keeping fees low most important?",
        "question_loans": "Are you looking for personal borrowing or home finance?",
        "fallback_match": "Based on what you shared, **{title}** is the closest catalogue match. Its listed headline is **{headline}**.",
        "fallback_generic": "Tell me what you want the product to help with, and I’ll narrow down the public options.",
        "disclosure": STANDARD_DISCLOSURE,
    },
    "hi": {
        "auth_prompt": "अपने निजी खाते देखने, बैलेंस जानने, सेवाओं (जैसे चेकबुक) का अनुरोध करने या पैसे ट्रांसफर करने के लिए कृपया अपने मोबाइल नंबर से सुरक्षित रूप से साइन इन करें। आपकी बैंकिंग गोपनीयता की सुरक्षा के लिए कोष निजी खाते की जानकारी दिखाने से पहले प्रमाणीकरण अनिवार्य रखता है।",
        "auth_title": "प्रमाणीकरण आवश्यक",
        "auth_message": "अपने खाते का बैलेंस, लेन-देन का इतिहास, कार्ड देखने या खाता सेवाओं का अनुरोध करने के लिए कृपया सुरक्षित रूप से साइन इन करें।",
        "auth_message_service": "मौजूदा खाते से जुड़ी सेवाओं के लिए कृपया सुरक्षित रूप से साइन इन करें।",
        "auth_button": "कोष में साइन इन करें",
        "advisor_error": "मित्र अभी जवाब नहीं दे पाया। कृपया थोड़ी देर बाद फिर से कोशिश करें।",
        "transfer_approved": "एक ट्रांसफर प्रस्तावित किया गया था और कवच अनुमोदन विंडो में उसका सत्यापन और अनुमोदन पहले ही हो चुका है।",
        "guarded": "मैं मित्र हूँ, कोष का बैंकिंग सहायक, और इसी भूमिका में रहूँगा। मैं अपने निर्देश या अपनी बनावट की जानकारी साझा नहीं कर सकता, पर कोष के सेविंग्स, कार्ड, लोन और डिपॉज़िट में ख़ुशी से मदद करूँगा।",
        "competitor": "मैं केवल कोष के अपने प्रोडक्ट्स के बारे में बता सकता हूँ, इसलिए दूसरे बैंकों से तुलना नहीं करूँगा। कोष में ये उपलब्ध हैं: {products}। बताइए आपके लिए सबसे ज़रूरी क्या है, मैं सही विकल्प चुनने में मदद करूँगा।",
        "no_info": "माफ़ कीजिए, इस बारे में मेरे पास सत्यापित जानकारी नहीं है। मैं केवल कोष की प्रकाशित प्रोडक्ट जानकारी बता सकता हूँ, या आप हमारी हेल्पलाइन 1800 000 5674 पर कॉल कर सकते हैं। क्या खातों, कार्ड, लोन या डिपॉज़िट में कोई मदद करूँ?",
        "no_info_alt": "मैं इसका भरोसेमंद जवाब नहीं दे सकता। मैं कोष के खातों, कार्ड, लोन और डिपॉज़िट में मदद कर सकता हूँ, या आप 1800 000 5674 पर कॉल कर सकते हैं।",
        "question_discover": "आप किस ज़रूरत के लिए प्रोडक्ट ढूँढ रहे हैं?",
        "question_cards": "कार्ड में आपके लिए सबसे ज़रूरी क्या है: ट्रैवल, कैशबैक या कम फ़ीस?",
        "question_loans": "क्या आप पर्सनल लोन देख रहे हैं या होम लोन?",
        "fallback_match": "आपकी बताई जानकारी के आधार पर **{title}** कैटलॉग में सबसे उपयुक्त विकल्प है। इसकी सूचीबद्ध मुख्य खूबी **{headline}** है।",
        "fallback_generic": "बताइए कि आपको प्रोडक्ट से किस चीज़ में मदद चाहिए, फिर मैं उपलब्ध विकल्पों को आपके लिए छाँट दूँगा।",
        "disclosure": "यह केवल उदाहरण के लिए दी गई डेमो प्रोडक्ट जानकारी है। पात्रता और शर्तें लागू।",
    },
    "mr": {
        "auth_prompt": "तुमची वैयक्तिक खाती पाहण्यासाठी, शिल्लक तपासण्यासाठी, सेवांची (उदा. चेकबुक) विनंती करण्यासाठी किंवा पैसे ट्रान्सफर करण्यासाठी कृपया तुमच्या मोबाइल नंबरने सुरक्षितपणे साइन इन करा. तुमच्या बँकिंग गोपनीयतेच्या संरक्षणासाठी कोष वैयक्तिक खात्याची माहिती दाखवण्यापूर्वी प्रमाणीकरण आवश्यक ठेवते.",
        "auth_title": "प्रमाणीकरण आवश्यक",
        "auth_message": "तुमच्या खात्यातील शिल्लक, व्यवहारांचा इतिहास, कार्ड पाहण्यासाठी किंवा खाते सेवांची विनंती करण्यासाठी कृपया सुरक्षितपणे साइन इन करा.",
        "auth_message_service": "विद्यमान खात्याशी संबंधित सेवांसाठी कृपया सुरक्षितपणे साइन इन करा.",
        "auth_button": "कोषमध्ये साइन इन करा",
        "advisor_error": "मित्र सध्या उत्तर देऊ शकला नाही. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
        "transfer_approved": "एक ट्रान्सफर प्रस्तावित केले होते आणि कवच मंजुरी विंडोमध्ये त्याची पडताळणी व मंजुरी आधीच झाली आहे.",
        "guarded": "मी मित्र आहे, कोषचा बँकिंग सहाय्यक, आणि याच भूमिकेत राहीन. मी माझ्या सूचना किंवा माझी रचना सांगू शकत नाही, पण कोषच्या सेव्हिंग्स, कार्ड, लोन आणि ठेवींसाठी आनंदाने मदत करेन.",
        "competitor": "मी फक्त कोषच्या स्वतःच्या प्रॉडक्ट्सबद्दल सांगू शकतो, त्यामुळे इतर बँकांशी तुलना करणार नाही. कोषमध्ये हे उपलब्ध आहे: {products}. तुमच्यासाठी सर्वात महत्त्वाचे काय ते सांगा, मी योग्य पर्याय निवडायला मदत करेन.",
        "no_info": "क्षमस्व, याबद्दल माझ्याकडे पडताळलेली माहिती नाही. मी फक्त कोषची प्रकाशित प्रॉडक्ट माहिती सांगू शकतो, किंवा तुम्ही आमच्या हेल्पलाइन 1800 000 5674 वर कॉल करू शकता. खाती, कार्ड, लोन किंवा ठेवींबद्दल काही मदत करू का?",
        "no_info_alt": "मी याचे विश्वासार्ह उत्तर देऊ शकत नाही. मी कोषची खाती, कार्ड, लोन आणि ठेवींसाठी मदत करू शकतो, किंवा तुम्ही 1800 000 5674 वर कॉल करू शकता.",
        "question_discover": "तुम्हाला कोणत्या गरजेसाठी प्रॉडक्ट हवे आहे?",
        "question_cards": "कार्डमध्ये तुमच्यासाठी सर्वात महत्त्वाचे काय आहे: प्रवास, कॅशबॅक की कमी शुल्क?",
        "question_loans": "तुम्ही पर्सनल लोन शोधत आहात की होम लोन?",
        "fallback_match": "तुम्ही सांगितलेल्या माहितीनुसार **{title}** हा कॅटलॉगमधील सर्वात योग्य पर्याय आहे. त्याचे नमूद मुख्य वैशिष्ट्य **{headline}** आहे.",
        "fallback_generic": "प्रॉडक्टकडून तुम्हाला कशासाठी मदत हवी आहे ते सांगा, मग मी उपलब्ध पर्याय तुमच्यासाठी निवडून देतो.",
        "disclosure": "ही केवळ उदाहरणादाखल दिलेली डेमो प्रॉडक्ट माहिती आहे. पात्रता आणि अटी लागू.",
    },
}


def chat_text(key: str, language: str = "en") -> str:
    return CHAT_TEXT[normalize_language(language)][key]


def auth_challenge_presentation(language: str = "en", message_key: str = "auth_message") -> Dict[str, str]:
    return {
        "type": "AUTH_CHALLENGE",
        "title": chat_text("auth_title", language),
        "message": chat_text(message_key, language),
        "action": "OPEN_LOGIN_MODAL",
        "button_text": chat_text("auth_button", language),
    }

_PUBLIC_FIELDS = {
    "id", "category", "category_label", "title", "tagline", "headline_rate", "badge", "featured",
    "features", "min_balance", "interest_payout", "joining_fee", "credit_limit", "min_deposit",
    "tenure_range", "max_amount", "tenure", "amc",
}

_TEXT_REPLACEMENTS = {
    "India's highest yield everyday savings with zero compromises": "Everyday savings with a zero-balance option",
    "Crafted from aerospace tungsten with unmatched luxury privileges": "A metal travel and rewards credit card",
    "Guaranteed wealth creation with maximum liquidity and safety": "Fixed-term savings with liquidity options",
    "Own your dream home with eco-concessions and lowest EMI": "Home finance with an illustrative green-home concession",
    "Seamless banking, Demat, and smart AI portfolio management": "Linked banking, Demat, and portfolio tools",
    "Highest Yield": "Featured",
    "Guaranteed Returns": "Fixed term",
    "Lowest Rate": "Starting rate",
}


def _safe_public_text(value: str) -> str:
    value = _TEXT_REPLACEMENTS.get(value, value)
    value = re.sub(r"\s*\(vs[^)]*\)", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\s*\(lowest in tier[^)]*\)", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\bpre-approved\b", "illustrative demo", value, flags=re.IGNORECASE)
    value = re.sub(r"\bmarket-leading\b", "starting", value, flags=re.IGNORECASE)
    value = re.sub(r"\bguaranteed interest\b", "illustrative fixed interest", value, flags=re.IGNORECASE)
    return value.strip()


def public_product_facts(product: Dict[str, Any]) -> Dict[str, Any]:
    """Return the allowlisted, provenance-bearing product shape exposed publicly."""
    safe: Dict[str, Any] = {}
    for key in _PUBLIC_FIELDS:
        if key not in product:
            continue
        value = copy.deepcopy(product[key])
        if isinstance(value, str):
            value = _safe_public_text(value)
        elif isinstance(value, list):
            value = [_safe_public_text(str(item)) for item in value]
        safe[key] = value
    safe["fact_metadata"] = {
        "source": CATALOGUE_SOURCE,
        "effective_from": CATALOGUE_EFFECTIVE_FROM,
        "last_reviewed_at": CATALOGUE_REVIEWED_AT,
        "illustrative": True,
    }
    safe["disclosure"] = STANDARD_DISCLOSURE
    return safe


_CONFIRM_PATTERN = re.compile(
    r"\b(yes|yeah|yep|confirm|confirmed|submit|go ahead|proceed|correct|looks good|all good|ok submit|haan|han|ho|theek)\b"
    r"|हाँ|हां|ठीक है|सबमिट|होय|बरोबर", re.IGNORECASE)
_NEGATION_PATTERN = re.compile(r"\b(no|not|don't|dont|wait|change|wrong|edit|cancel)\b|नहीं|नाही", re.IGNORECASE)
_DECLINE_PATTERN = re.compile(r"no thanks|not interested|don't want|dont want|skip (the )?(card|offer)|no card|नहीं चाहिए|नको", re.IGNORECASE)


@dataclass
class SalesSessionContext:
    """Non-sensitive, visitor-provided context for one in-memory sales conversation."""
    stage: str = "DISCOVER"
    goal: Optional[str] = None
    preferences: Dict[str, str] = field(default_factory=dict)
    considered_product_ids: List[str] = field(default_factory=list)
    last_recommendation: Optional[str] = None
    unanswered_question: Optional[str] = None
    turn_count: int = 0
    user_prompts: List[str] = field(default_factory=list)
    # Application journey memory: a prepared draft, whether the visitor confirmed it, and what was submitted.
    pending_application: Optional[Dict[str, Any]] = None
    application_confirmed: bool = False
    submitted_applications: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # Cross-sell memory: each companion offer is shown once and never again after a "no".
    shown_companions: List[str] = field(default_factory=list)
    companion_declined: bool = False
    recorded_leads: Dict[str, Any] = field(default_factory=dict)
    last_fallback: Optional[str] = None
    verified_facts: List[str] = field(default_factory=list)
    last_reason: Optional[str] = None  # why the last model reply was withheld (monitoring)
    no_selling: bool = False  # set for complaints, fraud and distress: no offers or cross-sell for the rest of the chat

    def reset(self) -> None:
        self.stage = "DISCOVER"
        self.goal = None
        self.preferences.clear()
        self.considered_product_ids.clear()
        self.last_recommendation = None
        self.unanswered_question = None
        self.turn_count = 0
        self.user_prompts.clear()
        self.pending_application = None
        self.application_confirmed = False
        self.submitted_applications.clear()
        self.shown_companions.clear()
        self.companion_declined = False
        self.recorded_leads.clear()
        self.last_fallback = None
        self.verified_facts.clear()
        self.no_selling = False

    def update(self, prompt: str) -> None:
        text = _normalize_prompt(prompt)
        self.turn_count += 1
        self.user_prompts.append(prompt)
        # The visitor's own words decide confirmation and declines; the model cannot set these.
        if self.pending_application:
            self.application_confirmed = bool(_CONFIRM_PATTERN.search(text)) and not _NEGATION_PATTERN.search(text)
        if _DECLINE_PATTERN.search(text):
            self.companion_declined = True

        # English + Hindi/Marathi (Devanagari and romanized) product vocabulary.
        goal_terms = {
            "cards": ("credit card", "card", "cashback", "rewards", "lounge", "forex", "vajra", "neo",
                      "कार्ड", "कैशबैक", "कॅशबॅक"),
            "savings": ("savings", "zero balance", "bank account", "suvarna", "bachat",
                        "बचत", "सेविंग", "सेव्हिंग"),
            "deposits": ("fixed deposit", "fd", "term deposit", "vriddhi",
                         "एफडी", "फिक्स्ड डिपॉजिट", "सावधि जमा", "मुदत ठेव"),
            "loans": ("loan", "borrow", "emi", "mortgage", "house", "karz", "karj",
                      "लोन", "ऋण", "कर्ज"),
            "wealth": ("demat", "wealth", "invest", "stocks", "mutual fund", "nivesh",
                       "निवेश", "गुंतवणूक", "डीमैट", "डिमॅट", "म्यूचुअल फंड", "म्युच्युअल फंड"),
        }
        account_talk = any(term in text for term in ("debit card", "open account", "open an account", "account opening",
                                                      "savings account", "खाता", "खाते"))
        if account_talk and "credit card" not in text:
            self.goal = "savings"  # a debit card or account opening belongs to the savings journey, not credit cards
        else:
            for goal, terms in goal_terms.items():
                if any(term in text for term in terms):
                    self.goal = goal
                    break
        preference_terms = {
            "travel": ("travel", "international", "lounge", "forex", "flight", "यात्रा", "प्रवास", "ट्रैवल", "लाउंज"),
            "cashback": ("cashback", "everyday", "shopping", "food", "uber", "कैशबैक", "कॅशबॅक", "शॉपिंग"),
            "low_fees": ("no fee", "low fee", "lifetime free", "zero fee", "कम फीस", "कमी शुल्क", "लाइफटाइम फ्री"),
            "liquidity": ("emergency", "liquid", "withdraw", "access my money", "इमरजेंसी", "आपत्कालीन"),
            "home": ("home", "house", "mortgage", "ghar", "घर", "गृह"),
            "personal": ("personal loan", "short-term loan", "पर्सनल लोन", "वैयक्तिक कर्ज"),
        }
        for preference, terms in preference_terms.items():
            if any(term in text for term in terms):
                self.preferences[preference] = "user_stated"

        applying = any(term in text for term in (
            "apply", "open it", "open account", "open an account", "open my account", "sign up", "start application",
            "start my", "अप्लाई", "आवेदन", "अर्ज कर", "खाता खोल", "खाते उघड"))
        needs_preference = self.goal in {"cards", "loans"} and not self.preferences
        questions = CHAT_TEXT["en"]
        if not self.goal:
            self.stage = "DISCOVER"
            self.unanswered_question = questions["question_discover"]
        elif needs_preference and not applying:
            self.stage = "CLARIFY"
            self.unanswered_question = questions["question_cards" if self.goal == "cards" else "question_loans"]
        elif applying:
            self.stage = "NEXT_ACTION"
            self.unanswered_question = None
        else:
            self.stage = "RECOMMEND" if self.turn_count <= 2 else "EXPLAIN"
            self.unanswered_question = None

    def snapshot(self) -> Dict[str, Any]:
        return {
            "pending_application": self.pending_application,
            "visitor_confirmed_pending_application": self.application_confirmed,
            "submitted_applications": self.submitted_applications,
            "companion_offers_already_shown": list(self.shown_companions),
            "visitor_declined_companion_offer": self.companion_declined,
            "stage": self.stage,
            "goal": self.goal,
            "preferences": dict(self.preferences),
            "considered_product_ids": list(self.considered_product_ids),
            "last_recommendation": self.last_recommendation,
            "unanswered_question": self.unanswered_question,
            "turn_count": self.turn_count,
            "no_selling_this_chat": self.no_selling,
        }


_GOAL_PRODUCTS = {
    "savings": ["PROD-SAV-PREMIER", "PROD-SAV-DIGITAL"],
    "cards": ["PROD-CARD-OBSIDIAN", "PROD-CARD-CASHBACK"],
    "deposits": ["PROD-FD-SMART"],
    "loans": ["PROD-LOAN-EXPRESS", "PROD-LOAN-HOME"],
    "wealth": ["PROD-WEALTH-ALPHA"],
}


class SalesAdvisorEngine:
    """Deterministic sales state, matching, summaries, and trusted UI actions."""

    def _ranked_ids(self, context: SalesSessionContext, query: str) -> List[str]:
        ids = list(_GOAL_PRODUCTS.get(context.goal or "", []))
        text = query.lower()
        explicit = {
            "vajra": "PROD-CARD-OBSIDIAN", "metal card": "PROD-CARD-OBSIDIAN",
            "neo": "PROD-CARD-CASHBACK", "cashback": "PROD-CARD-CASHBACK",
            "premier": "PROD-SAV-PREMIER", "digital smart": "PROD-SAV-DIGITAL",
            "fixed deposit": "PROD-FD-SMART", "vriddhi": "PROD-FD-SMART", "personal loan": "PROD-LOAN-EXPRESS",
            "home loan": "PROD-LOAN-HOME", "demat": "PROD-WEALTH-ALPHA",
        }
        for term, product_id in explicit.items():
            if term in text:
                return [product_id] + [item for item in ids if item != product_id]
        if context.goal == "cards":
            preferred = "PROD-CARD-CASHBACK" if {"cashback", "low_fees"} & context.preferences.keys() else "PROD-CARD-OBSIDIAN"
            ids = [preferred] + [item for item in ids if item != preferred]
        if context.goal == "loans" and "home" in context.preferences:
            ids = ["PROD-LOAN-HOME", "PROD-LOAN-EXPRESS"]
        return ids

    def build_action(self, query: str, context: SalesSessionContext) -> Dict[str, Any]:
        ids = [] if context.stage in {"DISCOVER", "CLARIFY"} else self._ranked_ids(context, query)
        products = [public_product_facts(product) for product_id in ids
                    if (product := get_product_by_id(product_id)) is not None]
        if products:
            context.considered_product_ids = list(dict.fromkeys(context.considered_product_ids + ids))
            context.last_recommendation = products[0]["id"]
        applying = context.stage == "NEXT_ACTION" and bool(products)
        reasons = []
        if context.goal:
            reasons.append(f"You are exploring {context.goal} products")
        reasons.extend({
            "travel": "You prioritized travel and international use",
            "cashback": "You prioritized cashback on everyday spending",
            "low_fees": "You said keeping fees low matters",
            "liquidity": "You said access to funds matters",
            "home": "You are looking for home finance",
            "personal": "You are looking for personal borrowing",
        }[item] for item in context.preferences)
        enriched = []
        for index, product in enumerate(products):
            item = copy.deepcopy(product)
            item["match_reasons"] = reasons if index == 0 else ["Another option in the same product category"]
            item["tradeoffs"] = ["Rates, benefits and eligibility are illustrative and subject to applicable terms."]
            enriched.append(item)
        target_prod_id = products[0]["id"] if products else context.last_recommendation
        companion_offer = None
        if (target_prod_id and context.stage in {"RECOMMEND", "EXPLAIN", "NEXT_ACTION"}
                and not context.shown_companions and not context.companion_declined and not context.no_selling):  # one companion offer per chat
            companion_offer = get_companion_cross_sell(target_prod_id)
            if companion_offer:
                context.shown_companions.append(target_prod_id)
        return {
            "action": "offer_onboarding" if applying else ("show_products" if products else "gather_context"),
            "stage": context.stage,
            "product_id": products[0]["id"] if applying else None,
            "products": enriched,
            "companion_cross_sell": companion_offer,
            "summary": {
                "goal": context.goal,
                "preferences": list(context.preferences),
                "recommended_product_id": context.last_recommendation,
            },
            "follow_up_question": context.unanswered_question,
            "next_action": ({
                "type": "OPEN_APPLICATION",
                "product_id": products[0]["id"],
                "label": "Review application",
            } if applying else None),
            "suggested_queries": self._suggested_queries(context),
            "disclosures": [STANDARD_DISCLOSURE, "Do not share passwords, OTPs, card details, or identity documents in chat."],
        }

    def answer_query(self, query: str, context: Optional[SalesSessionContext] = None) -> Dict[str, Any]:
        sales_context = context or SalesSessionContext()
        sales_context.update(query)
        return dict(self.build_action(query, sales_context), text="")

    @staticmethod
    def _suggested_queries(context: SalesSessionContext) -> List[str]:
        if context.unanswered_question:
            if context.goal == "cards":
                return ["Travel and international use", "Cashback on everyday spending", "Keeping fees low"]
            if context.goal == "loans":
                return ["Personal borrowing", "Home finance"]
            if context.goal == "savings":
                return ["High interest yield", "Zero balance account"]
            if context.goal == "deposits":
                return ["Short term (6-12 mos)", "Long term tax saver (5 yrs)"]
            return ["Savings", "Credit cards", "Fixed deposits", "Loans"]

        # Contextual options based on active category and recommendation
        if context.goal == "loans":
            return ["Salaried (> ₹50k/mo)", "Self-employed / Business", "Check EMI & interest", "Apply online"]
        if context.goal == "cards":
            return ["Compare with Vajra Card", "Check reward rate & perks", "Check pre-approval", "Apply now"]
        if context.goal == "deposits":
            return ["Calculate 1-year returns", "Senior citizen rates", "Open Fixed Deposit"]
        if context.goal == "savings":
            return ["Zero balance features", "Free Metal Debit Card", "Open account online"]
        if context.goal == "wealth":
            return ["Zero brokerage benefits", "Direct mutual funds", "Open 3-in-1 Demat"]
        if context.stage == "NEXT_ACTION":
            return ["Start digital application", "Required documents", "Speak with a banker"]
        return ["Explain the fees and important terms", "Show another option", "Summarize what we discussed"]


COMPANION_CROSS_SELL: Dict[str, Dict[str, Any]] = {
    "PROD-LOAN-EXPRESS": {
        "type": "CROSS_SELL_OFFER",
        "product_id": "PROD-SAV-PREMIER",
        "title": "Kosh Suvarna Premier Savings Bundle",
        "badge": "Exclusive Disbursal Perk",
        "headline_rate": "7.20% p.a. + Zero Fees",
        "special_offer": "Disburse your loan into a Suvarna Premier Account with zero disbursal deductions, 7.20% monthly yield on surplus funds, and a complimentary Metal Debit Card with airport lounge access!",
        "key_perks": [
            "Zero loan disbursal & account maintenance charges",
            "7.20% p.a. interest compounded and credited monthly",
            "Complimentary domestic & international airport lounge access",
        ],
        "options": [
            {"label": "✨ Bundle Premier Account", "prompt": "Tell me more about bundling Suvarna Premier Savings with my loan"},
            {"label": "🛡️ Add Loan Protection", "prompt": "What are the loan protection insurance options?"},
        ],
    },
    "PROD-LOAN-HOME": {
        "type": "CROSS_SELL_OFFER",
        "product_id": "PROD-FD-SMART",
        "title": "Kosh Home Buyer Smart Reserve Bundle",
        "badge": "Interest Offset",
        "headline_rate": "8.10% Fixed Yield",
        "special_offer": "Park renovation and emergency home funds in a Vriddhi Smart FD at 8.10% with zero break penalties after 6 months to offset home loan interest!",
        "key_perks": [
            "A fixed 8.10% yield with monthly interest credit",
            "Instant liquidity buffer for emergency home expenses",
            "Zero premature withdrawal penalty after 6 months",
        ],
        "options": [
            {"label": "📈 View Smart Reserve FD", "prompt": "Tell me about the Vriddhi Smart FD reserve for home buyers"},
            {"label": "🌿 Check Green Home Concession", "prompt": "How does the 0.25% green concession apply to my home loan?"},
        ],
    },
    "PROD-CARD-OBSIDIAN": {
        "type": "CROSS_SELL_OFFER",
        "product_id": "PROD-FD-SMART",
        "title": "Kosh Wealth Backed Credit Booster",
        "badge": "Priority Wealth",
        "headline_rate": "8.10% FD + 5X Points",
        "special_offer": "Earn a fixed 8.10% p.a. on a Vriddhi Smart FD, with a Vajra credit limit backed by the FD (subject to credit assessment) and the ₹10,000 Taj voucher on card activation.",
        "key_perks": [
            "Complimentary ₹10,000 Taj Hotels voucher on activation",
            "Unlimited international lounge access & 1.5% forex",
            "High-yield 8.10% return on linked deposit",
        ],
        "options": [
            {"label": "💳 Check Vajra Perks", "prompt": "What are all the exclusive perks of the Vajra Metal Card?"},
            {"label": "🏦 Open Linked FD Booster", "prompt": "How do I link a Fixed Deposit for credit limit booster?"},
        ],
    },
    "PROD-CARD-CASHBACK": {
        "type": "CROSS_SELL_OFFER",
        "product_id": "PROD-SAV-PREMIER",
        "title": "Kosh Everyday Cash Booster Bundle",
        "badge": "Lifetime Free",
        "headline_rate": "5% Cashback + 7.2% Savings",
        "special_offer": "Pair your Lifetime-Free Neo Cashback Card with Suvarna Premier Savings for automated bill clearing and 5% instant cashback on food & shopping!",
        "key_perks": [
            "Flat 5% instant cashback on food, shopping, and Uber",
            "7.20% p.a. monthly interest on your daily balance",
            "Zero annual fee & zero minimum balance penalty",
        ],
        "options": [
            {"label": "✨ Apply for Neo Card", "prompt": "I want to apply for the Kosh Neo Cashback Credit Card"},
            {"label": "🔍 View Cashback Categories", "prompt": "Which merchants offer 5% flat cashback with the Neo card?"},
        ],
    },
    "PROD-SAV-PREMIER": {
        "type": "CROSS_SELL_OFFER",
        "product_id": "PROD-CARD-CASHBACK",
        "title": "Kosh Neo Card Companion",
        "badge": "Lifetime Free",
        "headline_rate": "Lifetime Free + 5% Back",
        "special_offer": "Opening your Premier Savings Account instantly qualifies you for a Lifetime-Free Neo Cashback Card with zero paperwork!",
        "key_perks": [
            "Zero annual fee forever (Lifetime Free)",
            "Instant paperless issuance alongside account KYC",
            "Flat 5% cashback on top merchant partners",
        ],
        "options": [
            {"label": "💳 Add the Neo Card", "prompt": "I would like to add the Neo Cashback Card"},
            {"label": "🏛️ Proceed with Account Opening", "prompt": "Start my Suvarna Premier Savings account application"},
        ],
    },
    "PROD-FD-SMART": {
        "type": "CROSS_SELL_OFFER",
        "product_id": "PROD-WEALTH-ALPHA",
        "title": "Kosh Smart Wealth 3-in-1 Companion",
        "badge": "Zero Brokerage",
        "headline_rate": "0% Equity Brokerage",
        "special_offer": "Link your 8.10% Vriddhi Smart FD to a Kosh Nivesh Demat account with zero lifetime AMC and direct zero-commission mutual funds!",
        "key_perks": [
            "Zero lifetime AMC on Demat & trading account",
            "Sweep idle investment funds into high-yield deposits",
            "Automated SIPs aligned with your risk milestones",
        ],
        "options": [
            {"label": "📊 Explore 3-in-1 Nivesh Wealth", "prompt": "Tell me more about Kosh Nivesh Demat and Wealth"},
            {"label": "🏦 Proceed with Vriddhi Smart FD", "prompt": "Calculate my returns for a 1-year Vriddhi Smart FD"},
        ],
    },
}


def get_companion_cross_sell(product_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Return the companion cross-sell presentation card for a product."""
    if not product_id:
        return None
    norm = product_id.strip().upper()
    return copy.deepcopy(COMPANION_CROSS_SELL.get(norm))


FOIR_LIMIT = 50.0  # % of monthly income that all EMIs together may take (typical retail-lending ceiling)


def _rupees(text: str) -> Optional[int]:
    match = re.search(r"₹\s?([\d,]+)", text or "")
    return int(match.group(1).replace(",", "")) if match else None


def loan_affordability(product_id: str, loan_amount: int, tenure_months: int, monthly_income: int, existing_emi: int = 0) -> Dict[str, Any]:
    """Responsible-lending check: EMI at the published starting rate against the customer's income. Amounts in rupees."""
    product = get_product_by_id(product_id)
    if not product or product.get("category") != "loans":
        return {"ok": False, "message": "Choose one of Kosh's loans: PROD-LOAN-EXPRESS or PROD-LOAN-HOME."}
    if min(loan_amount, tenure_months, monthly_income) <= 0 or existing_emi < 0:
        return {"ok": False, "message": "Loan amount, tenure and monthly income must be positive numbers."}
    max_tenure = 60 if product["id"] == "PROD-LOAN-EXPRESS" else 360
    min_tenure = 12 if product["id"] == "PROD-LOAN-EXPRESS" else 12
    if not min_tenure <= tenure_months <= max_tenure:
        return {"ok": False, "message": f"{product['title']} tenure is {product.get('tenure')}."}
    rate = float(re.search(r"\d+(?:\.\d+)?", product["headline_rate"]).group())
    r = rate / 1200
    factor = (1 + r) ** tenure_months
    emi = round(loan_amount * r * factor / (factor - 1))
    foir = round(100 * (emi + existing_emi) / monthly_income, 1)
    cap = max(0.0, monthly_income * FOIR_LIMIT / 100 - existing_emi)
    max_affordable = int(cap * (factor - 1) / (r * factor) // 1000 * 1000)
    product_max = _rupees(product.get("max_amount", ""))
    if product_max:
        max_affordable = min(max_affordable, product_max)
    verdict = "comfortable" if foir <= 40 else "stretched" if foir <= FOIR_LIMIT else "above the safe limit"
    return {
        "ok": True, "product": product["title"], "rate_used": product["headline_rate"] + " (published starting rate)",
        "monthly_emi": inr(emi), "total_interest": inr(emi * tenure_months - loan_amount), "total_repayable": inr(emi * tenure_months),
        "emi_to_income": f"{foir}%", "limit": f"{FOIR_LIMIT:g}%", "verdict": verdict,
        "max_affordable_loan": inr(max_affordable),
        "guidance": {"comfortable": "The EMI is comfortably within the customer's income.",
                     "stretched": "The EMI is affordable but leaves little room; suggest a longer tenure or a smaller amount.",
                     "above the safe limit": "The EMIs would take more than half of the income. Do not encourage this amount; suggest the maximum affordable loan or a longer tenure."}[verdict],
        "key_facts": ("Indicative only, at the published starting rate. The final rate, all fees and the all-inclusive annual percentage "
                      "rate (APR) are in the Key Fact Statement shared before you sign. Approval depends on Kosh's credit assessment."),
    }


def build_public_sales_tools(context_provider: Callable[[], SalesSessionContext]) -> List[Callable[..., Dict[str, Any]]]:
    """Create public, read-only Antigravity tools. These never access customer data or mutate banking state."""

    def search_public_products(category: str = "", priority: str = "") -> dict:
        """Search the current public demo catalogue by category or visitor-stated priority. Call before recommending a product."""
        context = context_provider()
        category = category.strip().lower()
        priority = priority.strip().lower()
        products = get_all_products(category or None)
        if priority:
            ranked = sorted(products, key=lambda product: priority not in json_text(product).lower())
        else:
            ranked = products
        context.considered_product_ids = list(dict.fromkeys(
            context.considered_product_ids + [product["id"] for product in ranked]
        ))
        return {"products": ranked, "fact_metadata": _catalogue_metadata(), "disclosure": STANDARD_DISCLOSURE}

    def get_public_product_details(product_ids: List[str]) -> dict:
        """Return trusted public facts for specific Kosh product IDs. Never infer missing facts."""
        context = context_provider()
        products = [public_product_facts(product) for product_id in product_ids[:5]
                    if (product := get_product_by_id(product_id)) is not None]
        context.considered_product_ids = list(dict.fromkeys(
            context.considered_product_ids + [product["id"] for product in products]
        ))
        return {"products": products, "fact_metadata": _catalogue_metadata(), "disclosure": STANDARD_DISCLOSURE}

    def compare_public_products(product_ids: List[str], dimensions: List[str]) -> dict:
        """Compare up to three Kosh products using only requested public catalogue fields. Competitor data is unavailable."""
        allowed_dimensions = _PUBLIC_FIELDS - {"features"}
        selected_dimensions = [item for item in dimensions[:8] if item in allowed_dimensions]
        rows = []
        for product_id in product_ids[:3]:
            product = get_product_by_id(product_id)
            if not product:
                continue
            safe = public_product_facts(product)
            rows.append({"id": safe["id"], "title": safe["title"], **{
                key: safe.get(key, "Not listed") for key in selected_dimensions
            }})
        return {"comparison": rows, "fact_metadata": _catalogue_metadata(), "disclosure": STANDARD_DISCLOSURE}

    def get_product_disclosures(product_id: str) -> dict:
        """Return the required disclosure and provenance for a public Kosh product."""
        product = get_product_by_id(product_id)
        return {
            "product_id": product_id,
            "found": product is not None,
            "disclosures": [STANDARD_DISCLOSURE, "Product availability and approval depend on eligibility and applicable terms."],
            "fact_metadata": _catalogue_metadata(),
        }

    def prepare_product_application(product_id: str, full_name: str, mobile: str, email: str,
                                    employment_type: str = "", pan_number: str = "", pincode: str = "",
                                    monthly_income: float = 0, loan_amount: float = 0,
                                    loan_tenure_months: int = 0, loan_purpose: str = "") -> dict:
        """Prepare a real Kosh application from details the visitor typed in this chat.
        Savings needs full_name, mobile, email. Cards also need pan_number, employment_type, monthly_income.
        Loans also need pan_number, employment_type, monthly_income, loan_amount, loan_tenure_months.
        Returns a summary: show it and ask the visitor to reply "confirm". Nothing is submitted yet."""
        context = context_provider()
        product = get_product_by_id(product_id)
        if not product:
            return {"ok": False, "error": "Unknown product_id. Call search_public_products first."}
        if product_id in context.submitted_applications:
            return {"ok": False, "already_submitted": context.submitted_applications[product_id]}
        category = (product.get("category") or "").lower()
        draft = {"product_id": product_id, "product_title": product["title"], "full_name": full_name.strip(),
                 "mobile": mobile.strip(), "email": email.strip(), "employment_type": employment_type.strip(),
                 "pan_number": pan_number.strip().upper(), "pincode": pincode.strip(), "monthly_income": monthly_income,
                 "loan_amount": loan_amount, "loan_tenure_months": loan_tenure_months, "loan_purpose": loan_purpose.strip()}
        needed = ["full_name", "mobile", "email"] + (["pan_number", "employment_type", "monthly_income"] if category in {"cards", "loans"} else []) \
            + (["loan_amount", "loan_tenure_months"] if category == "loans" else [])
        missing = [key for key in needed if not draft[key]]
        if missing:
            return {"ok": False, "missing_fields": missing, "instruction": "Ask the visitor only for these missing details."}
        context.pending_application = draft
        context.application_confirmed = False
        shown = {k: v for k, v in draft.items() if v and k != "pan_number"}
        if draft["pan_number"]:
            shown["pan"] = draft["pan_number"][:2] + "••••" + draft["pan_number"][-2:]
        return {"ok": True, "status": "AWAITING_VISITOR_CONFIRMATION", "summary": shown,
                "instruction": "Show this summary and ask the visitor to reply 'confirm' to submit. Do not say it is submitted."}

    def submit_product_application() -> dict:
        """Submit the prepared application. Works only after the visitor explicitly confirmed it in their latest message."""
        context = context_provider()
        draft = context.pending_application
        if not draft:
            return {"ok": False, "error": "No prepared application. Call prepare_product_application first."}
        if draft["product_id"] in context.submitted_applications:
            return {"ok": True, "note": "already submitted", **context.submitted_applications[draft["product_id"]]}
        if not context.application_confirmed:
            return {"ok": False, "status": "AWAITING_VISITOR_CONFIRMATION",
                    "error": "The visitor has not confirmed. Show the summary again and ask them to reply 'confirm'."}
        from fastapi import HTTPException
        from backend.api_models import ProductApplyRequest
        from backend.applications import submit_bound
        try:
            result = submit_bound(ProductApplyRequest(
                product_id=draft["product_id"], full_name=draft["full_name"], phone_number=draft["mobile"], email=draft["email"],
                employment_type=draft["employment_type"] or None, pan_number=draft["pan_number"] or None,
                pincode=draft["pincode"] or None, monthly_income=draft["monthly_income"] or None,
                loan_amount=draft["loan_amount"] or None, loan_tenure_months=draft["loan_tenure_months"] or None,
                loan_purpose=draft["loan_purpose"] or None))
        except HTTPException as exc:
            context.application_confirmed = False
            return {"ok": False, "error": exc.detail, "instruction": "Explain the problem and ask the visitor to correct that detail."}
        record = {"application_ref": result["application_ref"], "status": result["status"],
                  "product_title": draft["product_title"], "next_steps": result.get("next_steps", ""),
                  "email": draft["email"]}
        context.submitted_applications[draft["product_id"]] = record
        context.pending_application = None
        context.application_confirmed = False
        return {"ok": True, **record}

    def check_application_status(reference: str, mobile: str) -> dict:
        """Look up an application by its reference (e.g. SAV-APP-1A2B3C) and the mobile number used to apply.
        Both are required; never guess either. Returns status, product and next step only."""
        from backend.applications import bound_status
        status = bound_status(reference, mobile)
        return {"found": bool(status), **(status or {"message": "No application matches that reference and mobile number."})}

    def check_loan_affordability(product_id: str, loan_amount: int, tenure_months: int, monthly_income: int, existing_emi: int = 0) -> dict:
        """Before recommending or taking a loan application, check the EMI against the visitor's monthly income (all in rupees).
        Share the EMI, total repayable and verdict; never promise approval."""
        result = loan_affordability(product_id, loan_amount, tenure_months, monthly_income, existing_emi)
        if result.get("ok"):
            context_provider().verified_facts.extend([result["emi_to_income"], result["limit"], result["rate_used"]])
        return result

    def register_complaint(full_name: str, mobile: str, summary: str, category: str = "") -> dict:
        """Register the visitor's complaint (or a HARDSHIP request) with Kosh and return its reference and timelines.
        Use only the name and mobile the visitor gave in this chat."""
        from backend.care import open_case
        from banking_db import db
        context = context_provider()
        kind = "HARDSHIP" if category.strip().upper() == "HARDSHIP" else "GRIEVANCE"
        try:
            case = open_case(db, kind, summary, name=full_name, phone=mobile, category=category or kind)
        except ValueError as exc:
            return {"registered": False, "message": str(exc)}
        context.no_selling = True
        return {"registered": True, **case, "timeline": "Acknowledged within 1 working day; resolved within 30 days. If unresolved after 30 days "
                "or unhappy with the reply, the customer can complain to the RBI Ombudsman at cms.rbi.org.in."}

    def request_callback(full_name: str, mobile: str, reason: str, preferred_time: str = "") -> dict:
        """Arrange a call back from a Kosh representative within 1 working day. Use only details the visitor gave in this chat."""
        from backend.care import open_case
        from banking_db import db
        try:
            case = open_case(db, "CALLBACK", reason, name=full_name, phone=mobile, preferred_time=preferred_time)
        except ValueError as exc:
            return {"registered": False, "message": str(exc)}
        return {"registered": True, **case, "timeline": "A Kosh representative will call within 1 working day (9 am to 7 pm)."}

    from knowledge_service import query_bank_knowledge

    return [search_public_products, get_public_product_details, compare_public_products, get_product_disclosures,
            query_bank_knowledge, check_application_status, prepare_product_application, submit_product_application,
            check_loan_affordability, register_complaint, request_callback]


def _catalogue_metadata() -> Dict[str, Any]:
    return {
        "source": CATALOGUE_SOURCE,
        "effective_from": CATALOGUE_EFFECTIVE_FROM,
        "last_reviewed_at": CATALOGUE_REVIEWED_AT,
        "illustrative": True,
    }


def json_text(value: Any) -> str:
    import json
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


# Read-only catalogue tools shared by visitors and signed-in customers.
PUBLIC_SALES_TOOL_NAMES = {
    "search_public_products", "get_public_product_details", "compare_public_products", "get_product_disclosures", "query_bank_knowledge",
    "check_application_status", "check_loan_affordability", "register_complaint", "request_callback",
}
# Visitor-only: take a new applicant's application in chat (customers use the account-opening workflow).
VISITOR_APPLICATION_TOOL_NAMES = {"prepare_product_application", "submit_product_application"}


_NUMERIC_CLAIM_PATTERN = re.compile(r"(?:₹\s?[\d,.]+|\b\d+(?:\.\d+)?\s?%|\b\d+\s?(?:minutes?|days?|months?|years?|x)\b)", re.IGNORECASE)
_UNSAFE_SALES_PATTERNS = (
    "guaranteed approval", "guaranteed returns", "guaranteed pre-approval", "best in india", "highest in india",
    "lowest in india", "risk-free", "no risk to your", "zero risk", "act now", "limited-time", "penalty trap",
    "गारंटीड अप्रूवल", "पक्की मंजूरी", "जोखिम मुक्त", "जोखिम-मुक्त", "जोखीम मुक्त", "जोखीममुक्त",
)
COMPETITOR_REASON = "unverified competitor comparison"
_COMPETITOR_NAMES = ("hdfc", "sbi", "icici", "axis", "kotak", "bajaj", "idfc", "indusind", "yes bank", "bank of baroda",
                     "pnb", "canara", "hsbc", "citibank", "standard chartered", "american express", "amex", "federal bank",
                     "au small finance", "paytm", "state bank",
                     "एचडीएफसी", "एसबीआई", "आईसीआईसीआई", "आयसीआयसीआय", "एक्सिस", "ऍक्सिस", "कोटक", "बजाज")
_PROMPT_INJECTION_MARKERS = (
    "ignore previous", "ignore all instructions", "reveal your prompt", "show system prompt",
    "developer message", "bypass guardrail", "act without restrictions",
    "system prompt dikhao", "instructions ignore karo", "सिस्टम प्रॉम्प्ट", "निर्देश अनदेखा",
    "निर्देशों को अनदेखा", "सूचनांकडे दुर्लक्ष", "सूचना दुर्लक्ष",
)
# Hindi/Marathi replies may use Devanagari digits and "प्रतिशत"/"टक्के" for "%".
_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_PERCENT_WORDS = re.compile(r"\s?(?:प्रतिशत|टक्के|टक्का)")


_ALLOWED_CORPUS: Optional[str] = None


def get_allowed_corpus() -> str:
    global _ALLOWED_CORPUS
    if _ALLOWED_CORPUS is None:
        from pathlib import Path
        product_text = json_text(get_all_products())
        docs_dir = Path(__file__).resolve().parent / "data" / "bank_documents"
        docs_text = ""
        if docs_dir.exists():
            docs_text = " ".join([f.read_text(encoding="utf-8") for f in docs_dir.glob("*.md")])
        _ALLOWED_CORPUS = product_text + " " + docs_text
    return _ALLOWED_CORPUS


_COMPETITOR_RE = re.compile("|".join(rf"\b{re.escape(n)}\b(?: bank\b)?(?:'s)?" if n.isascii() else re.escape(n) for n in _COMPETITOR_NAMES), re.I)
_ATTRIBUTED = re.compile(r"\byou(?:'ve| have)?\b.{0,25}\b(said|mentioned|told|feel|felt|asked|think|thought|prefer|compared|shared|noted|wrote)\b", re.I)


def redact_attributed_competitors(text: str) -> str:
    """In sentences that only repeat what the customer said ("You mentioned HDFC..."), write "another bank".
    Sentences where Mitra itself talks about a rival bank are left alone, so the reply check still blocks them."""
    parts = re.split(r"((?<=[.!?।])\s+|\n+)", text or "")
    name = lambda m: "another bank's" if m.group().endswith("'s") else "another bank"
    return "".join(_COMPETITOR_RE.sub(name, part) if i % 2 == 0 and _ATTRIBUTED.search(part) else part
                   for i, part in enumerate(parts))


_NEGATED = re.compile(r"\b(no|not|never|nor|isn'?t|aren'?t|cannot|can'?t|don'?t|doesn'?t|won'?t|without)\b[^.!?\n]{0,25}$")


def _makes_unsafe_claim(lowered: str) -> bool:
    """An unsafe sales phrase that is asserted, not denied ("returns are not guaranteed" is honest)."""
    for pattern in _UNSAFE_SALES_PATTERNS:
        start = lowered.find(pattern)
        while start != -1:
            if not _NEGATED.search(lowered[max(0, start - 40):start]):
                return True
            start = lowered.find(pattern, start + 1)
    return False


def customer_reply_issue(text: str) -> Optional[str]:
    """Signed-in replies carry the customer's own figures, so only rival-bank talk and unsafe sales claims are checked."""
    lowered = text.lower()
    if _makes_unsafe_claim(lowered):
        return "unsupported promotional or approval claim"
    if any(re.search(rf"\b{re.escape(name)}\b", lowered) if name.isascii() else name in lowered for name in _COMPETITOR_NAMES):
        return COMPETITOR_REASON
    return None


def validate_sales_response(text: str, context: Optional[SalesSessionContext] = None) -> Optional[str]:
    """Return a safe replacement reason when generated sales copy exceeds trusted facts."""
    text = _PERCENT_WORDS.sub("%", text.translate(_DEVANAGARI_DIGITS))
    lowered = text.lower()
    if _makes_unsafe_claim(lowered):
        return "unsupported promotional or approval claim"
    if any(re.search(rf"\b{re.escape(name)}\b", lowered) if name.isascii() else name in lowered for name in _COMPETITOR_NAMES):
        return COMPETITOR_REASON
    allowed_corpus = get_allowed_corpus()
    if context and hasattr(context, "user_prompts"):
        allowed_corpus += " " + " ".join(context.user_prompts) + " " + " ".join(getattr(context, "verified_facts", []))
    # Compare rates by value so "2%", "2.0%" and "2.00%" are the same reviewed fact.
    allowed_rates = {float(v) for v in re.findall(r"(\d+(?:\.\d+)?)\s?%", allowed_corpus.translate(_DEVANAGARI_DIGITS))}
    for claim in _NUMERIC_CLAIM_PATTERN.findall(text):
        if "%" not in claim:
            continue
        value = re.search(r"\d+(?:\.\d+)?", claim.replace(",", ""))
        if value and float(value.group()) not in allowed_rates:
            return f"numeric rate claim is not in the reviewed catalogue: {claim}"
    return None



_PROMPT_INJECTION_PATTERN = re.compile(
    r"(ignore|disregard|forget|override|bypass)\b.{0,40}\b(instructions?|rules|prompt|guardrails?|policies)"
    r"|(reveal|print|show|display|repeat|output|dump|leak|tell me)\b.{0,40}\b(system|developer|hidden|initial|full|complete)\s+(prompt|instructions?|message)"
    r"|\b(system|developer)\s+(prompt|message|instructions?)\b"
    r"|\b(list|name|enumerate)\b.{0,30}\b(tools?|functions?)\b.{0,20}\b(you|can)\b"
    r"|\byou are now\b|\bjailbreak\b|\bDAN mode\b|\bdeveloper mode\b|\byou are no longer\b|\bfrom now on,? you\b"
    r"|\brepeat (everything|all|the text|what is|what's|the words)\b.{0,20}\b(above|before|earlier)\b|\babove this line\b"
    r"|\b(act|behave|respond|answer|speak|reply|talk)\s+(as|like)\s+(an?\s+|my\s+|the\s+)?(independent\s+|neutral\s+|unbiased\s+|external\s+)?"
    r"(auditor|regulator|rbi|lawyer|critic|journalist|developer|admin|administrator|hacker|competitor|another|different|unrestricted|uncensored|other|human|person|consultant|analyst)"
    r"|\b(pretend|imagine|role-?play)\b.{0,30}\b(you|to be|as)\b"
    r"|\b(your|the|this)\s+(chatbot'?s?\s+|bot'?s?\s+|assistant'?s?\s+)?(architecture|source code|codebase|backend|tech stack|training data)\b"
    r"|\bwhich\s+(ai\s+|llm\s+|language\s+)?model\s+(are you|do you use|powers you)\b"
    r"|\b(your|the)\s+(prompt|prompts)\b",
    re.IGNORECASE,
)
# Text that must never reach a customer: base-agent prompt, internal directives and tool names.
_INTERNAL_LEAK_PATTERN = re.compile(
    # Leaked content, not the words themselves: a refusal may say "I can't share my system instructions".
    r"you are antigravity|google deepmind|(system prompt|system instructions?|my instructions) (is|are|says|say|reads|read)\b|"
    r"here (is|are) my (system )?(prompt|instructions)|SYSTEM SALES DIRECTIVE|SecureToolGateHook|MITRA'S FIXED BOUNDARIES|CARE DIRECTIVE"
    r"|\b(get_customer_summary|get_transaction_history|get_outstanding_bills|get_security_alerts|propose_bill_payment"
    r"|propose_transfer|freeze_card|record_customer_lead|query_bank_knowledge|search_public_products|start_banking_workflow"
    r"|record_document_extraction|start_account_opening)\b",
    re.IGNORECASE,
)


def guarded_sales_prompt_reply(prompt: str, language: str = "en") -> Optional[str]:
    """Handle clear instruction-extraction attempts without sending them to the model."""
    normalized = _normalize_prompt(prompt)
    if any(marker in normalized for marker in _PROMPT_INJECTION_MARKERS) or _PROMPT_INJECTION_PATTERN.search(prompt):
        return chat_text("guarded", language)
    return None


def leaks_internal_prompt(text: str) -> bool:
    """True when generated text exposes the system prompt, internal directives or tool names."""
    return bool(_INTERNAL_LEAK_PATTERN.search(text or ""))


_AUTH_REQUIRED_PATTERNS = [
    r'\bplease\s+sign\s+in\b',
    r'\bsign\s+in\s+to\b',
    r'\bsign\s+in\s+for\b',
    r'\bsign\s+in\s+with\b',
    r'\bsign\s+in\s+first\b',
    r'\bplease\s+log\s+in\b',
    r'\blog\s+in\s+to\b',
    r'\blog\s+in\s+for\b',
    r'\bmust\s+be\s+(signed|logged)\s+in\b',
    r'\bauthentication\s+required\b',
    r'\brequires?\s+authentication\b',
    r'साइन\s*इन\s*कर',
    r'लॉग\s*इन\s*कर',
    r'लॉगिन\s*कर',
]
_AUTH_REQUIRED_REGEX = re.compile('|'.join(_AUTH_REQUIRED_PATTERNS), re.IGNORECASE)


def is_auth_required_reply(text: str) -> bool:
    """Detect if an agent's answer advises the user to sign in or authenticate."""
    return bool(_AUTH_REQUIRED_REGEX.search(text))


def _normalize_prompt(prompt: str) -> str:
    return unicodedata.normalize("NFC", prompt).lower().strip()


# Product/account-opening questions stay with the sales advisor.
_NOT_PERSONAL_BANKING_PHRASES = (
    "open an account", "open a new account", "how to open", "apply for", "new account", "explore", "catalogue", "compare",
    # Hindi / Marathi (Devanagari + romanized)
    "खाता खोल", "नया खाता", "खाते उघड", "नवीन खाते", "आवेदन", "अर्ज कर", "तुलना",
    "khata khol", "account khol", "naya khata", "navin khate", "khate ughad",
)
# Personal-account requests that need sign-in.
_PERSONAL_BANKING_PHRASES = (
    # English
    "my balance", "account balance", "check balance", "current balance", "available balance",
    "balance enquiry", "balance inquiry", "how much money", "show balance",
    "my account", "my accounts", "my statement", "mini statement", "bank statement",
    "recent transactions", "transaction history", "my transactions", "last transaction",
    "transfer to", "transfer money", "send money", "propose transfer", "transfer funds",
    "pay bill", "pay my bill", "electricity bill", "my bills", "bills due",
    "freeze card", "block card", "block my card", "freeze my card", "unfreeze card", "my debit card",
    "my kyc status", "check my kyc", "complete my kyc", "my beneficiary", "my beneficiaries",
    "service request", "stop cheque", "cheque status", "cancel cheque", "order cheque", "want a cheque",
    "chequebook", "checkbook", "cheque book", "check book",
    # Hindi (Devanagari)
    "मेरा बैलेंस", "मेरे बैलेंस", "बैलेंस चेक", "बैलेंस बता", "बैलेंस दिखा", "खाते में कितन",
    "मेरा खाता", "मेरे खाते", "मेरा अकाउंट", "मेरे अकाउंट", "स्टेटमेंट",
    "मेरे लेनदेन", "मेरा लेनदेन", "लेनदेन का इतिहास", "लेन-देन का इतिहास", "पिछले लेनदेन", "हाल के लेनदेन",
    "पैसे भेज", "पैसा भेज", "रुपये भेज", "पैसे ट्रांसफर", "पैसा ट्रांसफर", "रुपये ट्रांसफर",
    "बिल भर", "बिल का भुगतान", "कार्ड ब्लॉक", "कार्ड फ्रीज", "कार्ड बंद", "मेरा कार्ड",
    "चेकबुक", "चेक बुक", "पासबुक", "मेरा केवाईसी", "मेरी केवाईसी", "केवाईसी स्टेटस", "मेरे लाभार्थी", "लाभार्थी जोड",
    # Marathi (Devanagari)
    "माझी शिल्लक", "शिल्लक तपास", "शिल्लक दाखव", "माझा बॅलन्स", "माझे बॅलन्स", "खात्यात किती",
    "माझे खाते", "माझा खाते", "माझ्या खात्या", "माझे अकाउंट", "माझ्या अकाउंट",
    "माझे व्यवहार", "व्यवहारांचा इतिहास", "अलीकडील व्यवहार",
    "पैसे पाठव", "रक्कम पाठव", "पैसे ट्रान्सफर", "माझे कार्ड", "माझा कार्ड",
    "माझी केवायसी", "माझे केवायसी", "केवायसी स्टेटस", "माझे लाभार्थी", "लाभार्थी जोडा",
    # Romanized Hindi (Hinglish) / Marathi
    "mera balance", "mere balance", "balance check", "balance batao", "balance dikhao",
    "mera khata", "mere khate", "mera account", "mere account", "mere transactions",
    "paise bhej", "paisa bhej", "paise transfer", "paisa transfer",
    "statement chahiye", "statement bhejo", "statement dikhao", "statement pathva",
    "bill bharo", "bill bharna", "bill bhara", "card block", "mera card",
    "majha balance", "maza balance", "majhi shillak", "mazi shillak", "majha khata", "maza khata",
    "majhe khate", "maze khate", "majhya khatya", "mazya khatya", "majha card", "maza card",
    "paise pathav", "paise pathva", "majhe vyavahar", "maze vyavahar",
)
# "<amount> ... भेजो / पाठवा / bhejo" style send-money requests.
_SEND_WITH_AMOUNT = re.compile(r"\d.*(?:भेज|पाठव|bhej|pathav|pathva)|(?:भेज|पाठव|bhej|pathav|pathva)\S*\s.*\d")


def is_personal_banking_inquiry(prompt: str) -> bool:
    """Detect if an unauthenticated visitor is attempting to access personal banking services (en/hi/mr)."""
    p = _normalize_prompt(prompt)
    if any(phrase in p for phrase in _NOT_PERSONAL_BANKING_PHRASES):
        return False
    if re.search(r'\b(transfer|send|remit)\s+(?:money|funds|\d+|rs|inr|₹|to\b)', p) or re.search(r'\b(transfer|send|pay)\s+\d+', p):
        return True
    if re.search(r'\b(cheque|chequebook|checkbook|passbook)\b', p) or _SEND_WITH_AMOUNT.search(p):
        return True
    return any(phrase in p for phrase in _PERSONAL_BANKING_PHRASES)


_JOURNEY_TEXT = {
    "en": {"pending": "Please reply \"confirm\" to submit your {title} application, or tell me which detail to change.",
           "submitted": "Your {title} application {ref} is with a Kosh officer for review. Your sign-in details will be emailed to {email} once it is approved.",
           "collect": "I can open your {title} for you right here. Please share your full name, mobile number and email address."},
    "hi": {"pending": "अपना {title} आवेदन जमा करने के लिए \"confirm\" लिखें, या बताएँ कि कौन-सी जानकारी बदलनी है।",
           "submitted": "आपका {title} आवेदन {ref} कोष अधिकारी की समीक्षा में है। मंज़ूरी के बाद साइन-इन विवरण {email} पर ईमेल किए जाएँगे।",
           "collect": "मैं आपका {title} यहीं खोल सकता हूँ। कृपया अपना पूरा नाम, मोबाइल नंबर और ईमेल पता बताएँ।"},
    "mr": {"pending": "तुमचा {title} अर्ज सादर करण्यासाठी \"confirm\" लिहा, किंवा कोणती माहिती बदलायची ते सांगा.",
           "submitted": "तुमचा {title} अर्ज {ref} कोष अधिकाऱ्याच्या पुनरावलोकनात आहे. मंजुरीनंतर साइन-इन तपशील {email} वर ईमेल केले जातील.",
           "collect": "मी तुमचे {title} इथेच उघडू शकतो. कृपया तुमचे पूर्ण नाव, मोबाइल नंबर आणि ईमेल पत्ता सांगा."},
}


def safe_grounded_fallback(context: SalesSessionContext, language: str = "en", reason: Optional[str] = None) -> str:
    """A safe reply when the model's answer was withheld. Never the same text twice in a row."""
    reply = _fallback_text(context, language, reason)
    if reply == context.last_fallback:
        reply = chat_text("no_info_alt" if reply == chat_text("no_info", language) else "no_info", language)
    context.last_fallback = reply
    return reply


def _fallback_text(context: SalesSessionContext, language: str, reason: Optional[str]) -> str:
    text = CHAT_TEXT[normalize_language(language)]
    journey = _JOURNEY_TEXT[normalize_language(language)]
    if reason == COMPETITOR_REASON:
        category = {"cards": "cards", "loans": "loans", "savings": "savings", "deposits": "deposits"}.get(context.goal or "", "cards")
        titles = ", ".join(p["title"] for p in get_all_products(category)) or ", ".join(p["title"] for p in get_all_products())
        return text["competitor"].format(products=titles)
    if context.pending_application:
        return journey["pending"].format(title=context.pending_application["product_title"])
    if context.submitted_applications:
        record = list(context.submitted_applications.values())[-1]
        return journey["submitted"].format(title=record["product_title"], ref=record["application_ref"], email=record["email"])
    applying_to = get_product_by_id(context.last_recommendation or "")
    if context.stage == "NEXT_ACTION" and applying_to:
        return journey["collect"].format(title=applying_to["title"])
    if reason:  # the visitor asked something we could not answer safely: say so, never answer with our own question
        return text["no_info"]
    if context.unanswered_question:
        key = next((k for k, v in CHAT_TEXT["en"].items() if v == context.unanswered_question), None)
        return text.get(key, context.unanswered_question)
    product = get_product_by_id(context.last_recommendation or "")
    if product:
        safe = public_product_facts(product)
        return text["fallback_match"].format(title=safe["title"], headline=safe["headline_rate"]) + " " + text["disclosure"]
    return text["no_info"]


def extract_dynamic_suggestions(text: str) -> tuple[str, List[str]]:
    """Extract SUGGESTIONS: [...] from LLM response text, return (clean_text, suggestions_list).

    Robustly handles:
    - Standard JSON: ["Under ₹30,000/month", "Salaried"]
    - Single-quoted Python lists: ['Under ₹30,000/month', 'Salaried']
    - Unquoted lists without splitting on comma inside numbers: Under ₹30,000/month, Salaried
    - Markdown bullet lists: - Under ₹30,000/month
    """
    if not text:
        return text, []
    pattern = re.compile(r'SUGGESTIONS:\s*(\[[^\]]+\]|[^\n]+(?:\n\s*[-*]\s*[^\n]+)*)', re.IGNORECASE)
    match = pattern.search(text)
    if not match:
        return text.strip(), []
    raw = match.group(1).strip()
    suggestions: List[str] = []

    # 1. Try standard JSON parse
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            suggestions = [str(s).strip() for s in parsed if str(s).strip()]
    except Exception:
        pass

    # 2. Try Python AST literal_eval (handles single quotes e.g. ['Under ₹30,000/month'])
    if not suggestions and raw.startswith('[') and raw.endswith(']'):
        try:
            parsed = ast.literal_eval(raw)
            if isinstance(parsed, (list, tuple)):
                suggestions = [str(s).strip() for s in parsed if str(s).strip()]
        except Exception:
            pass

    # 3. Try regex extraction of quoted items: "..." or '...'
    if not suggestions:
        quoted = re.findall(r'["\']([^"\'\n]+)["\']', raw)
        if quoted:
            suggestions = [s.strip() for s in quoted if s.strip()]

    # 4. Try markdown bullet points: - Option 1 / * Option 2
    if not suggestions and ('\n' in raw or raw.startswith(('-', '*'))):
        bullets = re.findall(r'(?:^|\n)\s*[-*]\s*(.+)', raw)
        if bullets:
            suggestions = [b.strip().strip('"\'') for b in bullets if b.strip()]

    # 5. Fallback for unquoted comma-separated list, protecting numbers like 30,000 or 1,00,000
    if not suggestions:
        unquoted = re.split(r'(?<!\d),(?!\d)\s*', raw.strip('[]'))
        suggestions = [s.strip().strip('"\'') for s in unquoted if s.strip()]

    clean_text = pattern.sub('', text)
    clean_text = re.sub(r'\n\s*\n\s*$', '\n', clean_text).strip()

    cleaned_suggestions: List[str] = []
    seen = set()
    for s in suggestions:
        s_clean = s.strip()
        if s_clean and s_clean not in seen:
            seen.add(s_clean)
            cleaned_suggestions.append(s_clean)

    return clean_text, cleaned_suggestions[:5]


sales_advisor = SalesAdvisorEngine()
