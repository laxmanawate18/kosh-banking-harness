"""Grant a customer's digital-banking consent in a test database (every scope), as the consent screen would."""
import uuid

from auth_service import CONSENT_PURPOSE, CONSENT_SCOPE, TERMS_VERSION
from persistence import ConsentRecord, utc_dt


def grant_consent(db, customer_id="CUST-1001", scope=None):
    with db.runtime.sessions.begin() as session:
        session.add(ConsentRecord(id=f"CNS-TEST-{uuid.uuid4().hex[:8]}", customer_id=customer_id, purpose=CONSENT_PURPOSE,
                                  scope=list(scope or CONSENT_SCOPE), terms_version=TERMS_VERSION,
                                  capture_method="TEST", granted_at=utc_dt()))
