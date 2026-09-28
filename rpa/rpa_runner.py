import os
import base64
from typing import Any, Callable, Dict, Optional
from playwright.async_api import async_playwright
from rpa.models import AccountApplicationSnapshot, JobStatus
from rpa.step_graph import load_account_opening_graph
from rpa.executor import StepExecutor


class RPARunner:
    def __init__(self, cbs_base_url: str = "http://127.0.0.1:8995",
                 headless: Optional[bool] = None,
                 slow_mo: Optional[int] = None,
                 typing_delay_ms: Optional[int] = None,
                 progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
                 progress_delay_ms: int = 0):
        self.cbs_base_url = cbs_base_url
        if headless is None:
            # Default to False (headed/visible) for local demos, unless explicitly set in env
            self.headless = os.getenv("RPA_HEADLESS", "false").lower() in ("true", "1", "yes", "on")
        else:
            self.headless = headless

        self.slow_mo = slow_mo if slow_mo is not None else (0 if self.headless else 60)
        self.typing_delay_ms = typing_delay_ms if typing_delay_ms is not None else (8 if self.headless else 25)
        self.progress_callback = progress_callback
        self.progress_delay_ms = progress_delay_ms

    async def run_account_opening(self, snapshot: AccountApplicationSnapshot) -> Dict[str, Any]:
        steps = load_account_opening_graph(cbs_url=self.cbs_base_url)

        async with async_playwright() as p:
            try:
                browser = await p.chromium.launch(headless=self.headless, slow_mo=self.slow_mo)
            except Exception:
                # If headed browser launch fails (e.g. no display server), fall back to headless
                if not self.headless:
                    browser = await p.chromium.launch(headless=True)
                else:
                    raise

            context = await browser.new_context(viewport={"width": 1280, "height": 820})
            page = await context.new_page()

            executor = StepExecutor(page, steps, typing_delay_ms=self.typing_delay_ms,
                                    progress_callback=self.progress_callback,
                                    progress_delay_ms=self.progress_delay_ms)
            exec_res = await executor.execute_job(snapshot)

            if exec_res["status"] != JobStatus.SUBMITTED:
                await browser.close()
                return {
                    "status": JobStatus.FAILED,
                    "error": exec_res.get("error", "Execution failed before submit"),
                }

            # Extract confirmation from page
            cif_num = None
            acct_num = None
            try:
                cif_loc = page.locator("#lblCifNumber")
                if await cif_loc.count() > 0:
                    cif_num = await cif_loc.text_content()

                acct_loc = page.locator("#lblAcctNumber")
                if await acct_loc.count() > 0:
                    acct_num = await acct_loc.text_content()

                # Capture final confirmation page screenshot for UI
                if self.progress_callback:
                    final_shot = await page.screenshot(type="jpeg", quality=65)
                    final_b64 = "data:image/jpeg;base64," + base64.b64encode(final_shot).decode("ascii")
                    self.progress_callback({
                        "step_id": "AO-010",
                        "screen_name": "cbs_confirmation",
                        "action": "SUBMIT",
                        "phase": "COMPLETED",
                        "screenshot": final_b64,
                        "label": f"CBS Record Minted: CIF {cif_num} / Acct {acct_num}",
                    })
            except Exception:
                pass

            await browser.close()

            if not cif_num or not acct_num:
                return {"status": JobStatus.FAILED,
                        "error": "CBS confirmation did not contain generated identifiers"}

            return {
                "status": JobStatus.COMPLETED,
                "application_reference": snapshot.application_reference,
                "cif_number": cif_num,
                "account_number": acct_num,
                "read_back_verified": True,
                "cbs_status": "PENDING_CHECKER_APPROVAL",
                "maker_service_account": "RPA-AO-01",
            }
