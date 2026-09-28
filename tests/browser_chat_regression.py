"""Browser regressions. Run against a disposable seeded server, not shared banking data.

SENTINEL_DATABASE_URL=sqlite+pysqlite:////tmp/sentinel-browser.sqlite3 PORT=8018 venv/bin/python dev_ui.py
venv/bin/python tests/browser_chat_regression.py --url http://127.0.0.1:8018
Pass --live to exercise the configured LLM instead of deterministic socket replies.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


def run(url, live, screenshots):
    screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 900})
        sockets = []
        prompts = []
        errors = []
        customer_mode = False
        if not live:
            def handle_socket(ws):
                customer = customer_mode
                sockets.append(ws)
                ws.send(json.dumps({'type': 'connection_ready', 'session_id': 'customer-test' if customer else 'GUEST-test', 'visitor_mode': not customer}))
                def receive(raw):
                    message = json.loads(raw)
                    if message.get('type') != 'prompt':
                        return
                    prompts.append(message['prompt'])
                    ws.send(json.dumps({'type': 'turn_start', 'turn_id': str(len(prompts))}))
                    ws.send(json.dumps({'type': 'text_delta', 'text': 'A savings account offers flexible access; a deposit has a fixed term.'}))
                    if 'apply for the obsidian' in message['prompt'].lower():
                        ws.send(json.dumps({
                            'type': 'sales_action',
                            'action': 'offer_onboarding',
                            'stage': 'NEXT_ACTION',
                            'product_id': 'PROD-CARD-OBSIDIAN',
                            'products': [{
                                'id': 'PROD-CARD-OBSIDIAN', 'category': 'cards', 'category_label': 'Credit Cards',
                                'title': 'Sentinel Obsidian Metal Credit Card', 'tagline': 'A metal travel and rewards credit card',
                                'headline_rate': '5X Rewards', 'features': ['Travel rewards'],
                                'match_reasons': ['You selected this card'],
                                'tradeoffs': ['Eligibility and terms apply.'],
                                'fact_metadata': {'source': 'kosh_demo_catalogue', 'effective_from': '2026-09-01', 'last_reviewed_at': '2026-09-22', 'illustrative': True},
                            }],
                            'summary': {'goal': 'cards', 'preferences': ['travel'], 'recommended_product_id': 'PROD-CARD-OBSIDIAN'},
                            'next_action': {'type': 'OPEN_APPLICATION', 'product_id': 'PROD-CARD-OBSIDIAN', 'label': 'Review application'},
                            'disclosures': ['Illustrative demo product information. Eligibility and terms apply.'],
                        }))
                    ws.send(json.dumps({'type': 'turn_complete'}))
                ws.on_message(receive)
            context.route_web_socket('**/ws/chat**', handle_socket)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        print('Checking visitor chat', flush=True)
        page.goto(url)
        page.wait_for_load_state('networkidle')
        launcher = page.get_by_role('button', name='Ask Sentinel', exact=True)
        launcher.click()
        dialog = page.get_by_role('dialog', name='Mitra, Kosh AI banker')
        expect(dialog.get_by_role('status')).to_have_text('Connected')
        expect(dialog).to_contain_text('Sign in for help with your own accounts.')
        textbox = dialog.get_by_role('textbox', name='Message Mitra')
        textbox.fill('In two short sentences, explain how savings accounts differ from fixed deposits.')
        textbox.press('Enter')
        expect(dialog.locator('.message.assistant .markdown-content')).not_to_have_count(0, timeout=100000)
        expect(dialog.get_by_role('status')).to_have_text('Connected', timeout=100000)
        expect(dialog.locator('.message.error')).to_have_count(0)
        page.screenshot(path=str(screenshots / 'visitor-response.png'))
        print('Visitor reply received', flush=True)
        textbox.fill('I want to apply for the Obsidian card')
        textbox.press('Enter')
        application = dialog.get_by_role('button', name='Review application')
        expect(application).to_be_visible(timeout=100000)
        application.click()
        application_dialog = dialog.get_by_role('heading', name='Review Sentinel Obsidian Metal Credit Card')
        expect(application_dialog).to_be_visible()
        expect(dialog.locator('input').nth(0)).to_have_value('')
        expect(dialog.locator('input').nth(1)).to_have_value('')
        expect(dialog.locator('input').nth(2)).to_have_value('')
        dialog.get_by_role('button', name='Close dialog').click()
        expect(application_dialog).not_to_be_visible()
        if not live:
            textbox.fill('Keep this unsent draft')
            sockets[-1].close(code=1011, reason='Test disconnect')
            expect(dialog.get_by_role('status')).to_have_text('Disconnected')
            expect(dialog.get_by_role('button', name='Send message', exact=True)).to_be_disabled()
            expect(textbox).to_have_value('Keep this unsent draft')
            dialog.get_by_role('button', name='Reconnect', exact=True).click()
            expect(dialog.get_by_role('status')).to_have_text('Connected')
        dialog.get_by_role('button', name='New conversation').click()
        expect(dialog.locator('.message')).to_have_count(0)
        expect(dialog.get_by_role('status')).to_have_text('Connected')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.screenshot(path=str(screenshots / 'visitor-mobile.png'))
        box = dialog.bounding_box()
        assert box['x'] >= 0 and box['width'] <= 390 and box['height'] <= 844
        page.keyboard.press('Escape')
        expect(dialog).not_to_be_visible()
        expect(launcher).to_be_focused()
        page.set_viewport_size({'width': 1440, 'height': 900})
        print('Checking customer chat', flush=True)
        page.get_by_role('tab', name='Staff & Password').click()
        customer_mode = True
        page.locator('#loginForm button[type=submit]').click()
        expect(page.get_by_role('button', name='Sign out')).to_be_visible(timeout=15000)
        if page.get_by_role('button', name='Agree and continue').is_visible():
            page.get_by_role('checkbox').check()
            page.get_by_role('button', name='Agree and continue').click()
        page.locator('a[href="#ai-banker"]').click()
        workspace = page.locator('.ai-main-workspace').first
        expect(workspace.get_by_role('status')).to_have_text('Connected', timeout=15000)
        workspace.get_by_role('button', name='New conversation').click()
        expect(workspace.locator('.message')).to_have_count(0)
        expect(workspace.get_by_role('status')).to_have_text('Connected', timeout=15000)
        workspace.get_by_role('textbox', name='Message Mitra').fill('Say hello briefly.')
        workspace.get_by_role('button', name='Send message', exact=True).click()
        expect(workspace.locator('.message.assistant .markdown-content')).not_to_have_count(0, timeout=100000)
        expect(workspace.get_by_role('status')).to_have_text('Connected', timeout=100000)
        expect(workspace.locator('.message.error')).to_have_count(0)
        page.screenshot(path=str(screenshots / 'customer-response.png'))
        print('Checking logout isolation', flush=True)
        customer_mode = False
        page.get_by_role('button', name='Sign out').click()
        expect(page.get_by_role('tab', name='Mobile OTP')).to_be_visible()
        launcher.click()
        expect(dialog.locator('.message')).to_have_count(0)
        expect(dialog.get_by_role('status')).to_have_text('Connected')
        expect(dialog).to_contain_text('Sign in for help with your own accounts.')
        assert not errors, errors
        browser.close()
    print('PASS: visitor/customer chat, new conversations, mobile layout, keyboard focus, logout isolation' + ('' if live else ', disconnect and reconnect'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8018')
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--screenshots', type=Path, default=Path('/tmp/sentinel-chat-screenshots'))
    args = parser.parse_args()
    run(args.url, args.live, args.screenshots)
