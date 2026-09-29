"""Payment, identity, ownership and durable workflow tests for the retail portal."""
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

_DATABASE = tempfile.TemporaryDirectory()
os.environ.setdefault("SENTINEL_DATABASE_URL", f"sqlite+pysqlite:///{Path(_DATABASE.name) / 'portal-tests.sqlite3'}")

from fastapi.testclient import TestClient
import dev_ui


class PortalTests(unittest.TestCase):
    def setUp(self):
        dev_ui.limiter.reset()
        dev_ui.db.reset_to_seed()
        dev_ui.db.update_kyc_status('CUST-1001', 'VERIFIED')
        self.client = TestClient(dev_ui.app)
        _, self.raw_cookie, csrf = dev_ui.auth_service.create_direct_session('aarav')
        self.client.cookies.set(dev_ui.COOKIE_NAME, self.raw_cookie)
        self.headers = {'X-CSRF-Token': csrf}
        self.post('/api/consent', {'accepted': True})

    def post(self, path, payload=None):
        return self.client.post(path, headers=self.headers, json=payload or {})

    def transfer(self, **extra):
        return {'request_key': 'payment-test-000001', 'action': 'TRANSFER', 'source_account_id': 'ACC-SAL-001',
                'beneficiary_id': 'BEN-VIKRAM', 'amount_minor': 7500000, **extra}

    def step_up(self):
        # Stands in for a verified Firebase re-authentication (L3); the demo-code route no longer exists.
        dev_ui.auth_service.elevate_session(self.raw_cookie, 'L3')

    def test_unauthenticated_and_csrf_requests_are_rejected(self):
        anonymous = TestClient(dev_ui.app)
        self.assertEqual(anonymous.get('/api/portal/overview').status_code, 401)
        self.assertEqual(self.client.post('/api/portal/payments', json=self.transfer()).status_code, 403)

    def test_reviewed_transfer_requires_approval_and_executes_once(self):
        before = dev_ui.db.get_account('ACC-SAL-001')['balance_minor']
        proposal = self.post('/api/portal/payments', self.transfer()).json()
        self.assertIn('challenge', proposal)
        self.assertEqual(dev_ui.db.get_account('ACC-SAL-001')['balance_minor'], before)
        challenge = proposal['challenge']
        verification = {'transaction_digest': challenge['transaction_digest']}
        self.step_up()
        result = self.post(f"/api/challenges/{challenge['id']}/verify", verification).json()
        self.assertTrue(result['success'], result)
        replay = self.post('/api/portal/payments', self.transfer()).json()
        self.assertEqual(result['receipt']['reference'], replay['receipt']['reference'])
        self.assertEqual(dev_ui.db.get_account('ACC-SAL-001')['balance_minor'], before - 7500000)
        altered = self.post(f"/api/challenges/{challenge['id']}/verify", {**verification, 'transaction_digest': 'wrong'}).json()
        self.assertFalse(altered['success'])

    def test_transfer_above_75000_executes_only_after_fresh_step_up(self):
        payload = self.transfer(request_key='payment-over-75k-0001', amount_minor=9_000_000)
        before = dev_ui.db.get_account('ACC-SAL-001')['balance_minor']
        proposal = self.post('/api/portal/payments', payload).json()
        self.assertEqual(proposal['status'], 'CHALLENGE_REQUIRED')
        self.assertEqual(proposal['presentation']['type'], 'PAYMENT_CHALLENGE')
        challenge = proposal['challenge']
        verify = f"/api/challenges/{challenge['id']}/verify"
        blocked = self.post(verify, {'transaction_digest': challenge['transaction_digest']})
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()['detail']['code'], 'STEP_UP_REQUIRED')
        self.assertEqual(dev_ui.db.get_account('ACC-SAL-001')['balance_minor'], before)
        self.step_up()
        approved = self.post(verify, {'transaction_digest': challenge['transaction_digest']}).json()
        self.assertEqual(approved['status'], 'EXECUTED')
        self.assertEqual(approved['receipt']['amount_minor'], 9_000_000)
        self.assertEqual(dev_ui.db.get_account('ACC-SAL-001')['balance_minor'], before - 9_000_000)

    def test_concurrent_bill_retries_have_one_effect(self):
        payload = {'request_key': 'bill-concurrency-0001', 'action': 'PAY_BILL',
                   'source_account_id': 'ACC-SAL-001', 'bill_id': 'BILL-TATA-001'}
        before = dev_ui.db.get_account('ACC-SAL-001')['balance_minor']
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.post('/api/portal/payments', payload).json(), range(4)))
        self.assertEqual(len({r['receipt']['reference'] for r in results}), 1)
        self.assertEqual(dev_ui.db.get_account('ACC-SAL-001')['balance_minor'], before - 243000)

    def test_public_demo_code_cannot_raise_assurance(self):
        result = self.post('/api/auth/step-up', {'code': '246810'})
        self.assertIn(result.status_code, (404, 405))
        self.assertEqual(self.client.get('/api/auth/session').json()['assurance_level'], 'L2')

    def test_changed_stored_payment_cannot_upgrade_session(self):
        c = self.post('/api/portal/payments', self.transfer()).json()['challenge']
        pid = dev_ui.db.get_challenge(c['id'])['payment_intent_id']
        dev_ui.db.transaction(lambda data: next(p for p in data['payment_intents'] if p['id']==pid)['action'].update(amount_minor=9000000))
        before = dev_ui.db.get_account('ACC-SAL-001')['balance_minor']
        self.step_up()
        result = self.post(f"/api/challenges/{c['id']}/verify", {'transaction_digest':c['transaction_digest']}).json()
        self.assertEqual(result['status'], 'DENIED')
        self.assertEqual(dev_ui.db.get_account('ACC-SAL-001')['balance_minor'], before)

    def test_idempotency_conflict_and_money_schema(self):
        self.post('/api/portal/payments', self.transfer())
        changed = self.post('/api/portal/payments', self.transfer(amount_minor=7490000))
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(self.post('/api/portal/payments', self.transfer(amount_minor=1.3)).status_code, 422)
        self.assertEqual(self.post('/api/portal/payments', self.transfer(customer_id='OTHER')).status_code, 422)

    def test_intent_source_is_bound_and_mule_is_denied(self):
        result = self.post('/api/portal/payments', self.transfer(beneficiary_id='BEN-FASTCASH')).json()
        self.assertEqual(result['sentinel']['decision'], 'DENY')
        self.assertIn('KNOWN_MULE_DESTINATION', result['sentinel']['reason_codes'])
        intent = dev_ui.db.snapshot()['intents'][-1]
        self.assertEqual(intent['fields']['source_account_id'], 'ACC-SAL-001')

    def test_unknown_account_denied_and_revoked_consent_blocks_mutation(self):
        self.assertEqual(self.post('/api/portal/payments', self.transfer(source_account_id='OTHER')).status_code, 404)
        self.client.delete('/api/consent', headers=self.headers)
        self.assertEqual(self.post('/api/portal/payments', self.transfer()).status_code, 403)

    def test_beneficiary_creation_requires_step_up_and_cannot_alias_mule(self):
        payload = {'display_name': 'Priya Sharma', 'upi_id': 'priya@okaxis'}
        self.assertEqual(self.post('/api/portal/beneficiaries', payload).status_code, 403)
        self.step_up()
        result = self.post('/api/portal/beneficiaries', payload)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.json()['relationship'], 'NEW')
        self.assertEqual(self.post('/api/portal/beneficiaries', payload).status_code, 409)
        self.assertEqual(self.post('/api/portal/beneficiaries', {**payload, 'upi_id': 'fastcash@upi'}).status_code, 409)
        self.assertEqual(self.post('/api/portal/beneficiaries', {**payload, 'risk_status': 'TRUSTED'}).status_code, 422)

    def test_statement_is_account_and_date_scoped_and_escapes_csv_formulas(self):
        dev_ui.db.transaction(lambda data: data['transactions'][0].update(description='=DANGEROUS()'))
        query = '?account_id=ACC-SAL-001&start=2026-09-01&end=2026-09-10'
        result = self.client.get('/api/portal/statement.csv' + query)
        self.assertEqual(result.status_code, 200)
        self.assertIn("'=DANGEROUS()", result.text)
        self.assertIn('98000.00', result.text)
        self.assertEqual(self.client.get('/api/portal/statement.csv?account_id=OTHER&start=2026-09-01&end=2026-09-10').status_code, 404)
        self.assertEqual(self.client.get('/api/portal/statement.csv?account_id=ACC-SAL-001&start=2026-09-10&end=2026-09-01').status_code, 400)

    def test_appointment_validation_and_cancellation(self):
        payload = {'service_id': 'P1-23', 'data': {'account_id': 'ACC-SAL-001', 'details': 'Discuss account services',
                   'branch': 'Mumbai Fort', 'preferred_date': (date.today()+timedelta(days=2)).isoformat(), 'preferred_window': '10:00–11:00'}}
        result = self.post('/api/portal/service-requests', payload)
        self.assertEqual(result.status_code, 201, result.text)
        request_id = result.json()['id']
        cancelled = self.post(f'/api/portal/requests/{request_id}/cancel').json()
        self.assertEqual(cancelled['status'], 'CANCELLED')
        self.assertEqual(self.post(f'/api/portal/requests/{request_id}/cancel').status_code, 409)
        payload['data']['preferred_date'] = '2020-01-01'
        self.assertEqual(self.post('/api/portal/service-requests', payload).status_code, 422)

    def test_deposit_application_does_not_move_money(self):
        self.step_up()
        before = dev_ui.db.dashboard()['total_available_minor']
        result = self.post('/api/portal/service-requests', {'service_id': 'P1-19', 'data': {
            'account_id': 'ACC-SAL-001', 'details': 'Saving for a planned purchase', 'amount_minor': 500000, 'tenure_months': '12'}})
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.json()['status'], 'PENDING_APPROVAL')
        self.assertEqual(dev_ui.db.dashboard()['total_available_minor'], before)

    def test_customer_cannot_access_operations(self):
        self.assertEqual(self.client.get('/api/portal/operations').status_code, 403)

    def test_customer_activity_includes_forms_but_not_another_users_events(self):
        self.post('/api/portal/payments', self.transfer())
        dev_ui.db.append_audit('PRIVATE_OTHER_EVENT', session_id='OTHER-AUTH-SESSION', actor='OTHER-USER',
                               summary='Other customer private activity', details={'secret': 'DO_NOT_EXPOSE'})
        result = self.client.get('/api/portal/events').json()['events']
        self.assertTrue(any(e['event_type'] == 'INTENT_BOUND' for e in result))
        self.assertNotIn('DO_NOT_EXPOSE', str(result))
        self.assertNotIn('PRIVATE_OTHER_EVENT', str(result))

    def test_service_details_are_validated_and_bank_metadata_is_not_customer_controlled(self):
        self.step_up()
        cases = [('P1-04', {'leaves': '500'}), ('P1-05', {'cheque_number': 'bad'}),
                 ('P1-11', {'email': 'bad', 'mobile': '123'}),
                 ('P1-14', {'nominee_name': 'A', 'relationship': 'Unlisted'}),
                 ('P2-14', {'discrepancy_flags': 'OVERRIDE'})]
        for service_id, fields in cases:
            with self.subTest(service=service_id):
                response = self.post('/api/portal/service-requests', {'service_id': service_id, 'data': {
                    'account_id': 'ACC-SAL-001', 'details': 'A test service request', **fields}})
                self.assertEqual(response.status_code, 422, response.text)

    def test_initial_kyc_not_done_blocks_portal_transfers(self):
        dev_ui.db.update_kyc_status('CUST-1001', 'NOT_DONE')
        proposal = self.post('/api/portal/payments', self.transfer()).json()
        self.assertEqual(proposal['status'], 'DENIED')
        self.assertEqual(proposal['sentinel']['decision'], 'DENY')
        self.assertIn('KYC_NON_COMPLIANT', proposal['sentinel']['reason_codes'])

    def test_initial_kyc_onboarding_and_officer_approval_unblocks_transfers(self):
        from workflow_test_support import submit_kyc, VERIFICATION
        dev_ui.db.update_kyc_status('CUST-1001', 'NOT_DONE')
        dossier = submit_kyc(self.client, self.headers)
        self.assertEqual(dossier['status'], 'SUBMITTED')
        self.assertEqual(self.post('/api/portal/payments', self.transfer()) .json()['status'], 'DENIED')
        officer = TestClient(dev_ui.app)
        _, officer_cookie, officer_csrf = dev_ui.auth_service.create_direct_session('officer.mumbai')
        officer.cookies.set(dev_ui.COOKIE_NAME, officer_cookie)
        headers = {'X-CSRF-Token': officer_csrf}
        path = f"/api/officer/requests/{dossier['request_id']}/decision"
        missing = officer.post(path, headers=headers, json={'action':'APPROVE','reason':'Documents reviewed'})
        self.assertEqual(missing.status_code, 400)
        approved = officer.post(path, headers=headers, json={'action':'APPROVE','reason':'Synthetic evidence reviewed', **VERIFICATION})
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(dev_ui.db.get_kyc_profile('CUST-1001')['status'], 'VERIFIED')
        proposal = self.post('/api/portal/payments', self.transfer(request_key='after-kyc-approval-0001')).json()
        self.assertEqual(proposal['status'], 'CHALLENGE_REQUIRED')


if __name__ == '__main__':
    unittest.main()
