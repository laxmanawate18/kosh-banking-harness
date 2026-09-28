import base64
from typing import Any, Callable, Dict, List, Optional
from playwright.async_api import Page
from rpa.models import AccountApplicationSnapshot, JobStatus, StepAction, StepDefinition
from rpa.locator_resolver import resolve_locator
from rpa.verifier import verify_dom_read_back
from rpa.field_mapper import map_application_to_cbs


class StepExecutor:
    def __init__(self, page: Page, steps: List[StepDefinition], typing_delay_ms: int = 15,
                 progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
                 progress_delay_ms: int = 0):
        self.page = page
        self.steps = steps
        self.typing_delay_ms = typing_delay_ms
        self.progress_callback = progress_callback
        self.progress_delay_ms = progress_delay_ms
        self.screenshots: Dict[str, bytes] = {}

    def _progress(self, step: StepDefinition, phase: str, error: str | None = None,
                  screenshot: str | None = None) -> None:
        if not self.progress_callback:
            return
        event = {"step_id": step.step_id, "screen_name": step.screen_name,
                 "action": step.action.value, "phase": phase}
        if error:
            event["error"] = error
        if screenshot:
            event["screenshot"] = screenshot
        self.progress_callback(event)

    async def execute_job(self, snapshot: AccountApplicationSnapshot) -> Dict[str, Any]:
        cbs_data = map_application_to_cbs(snapshot)
        last_step_id = None

        try:
            for step in self.steps:
                last_step_id = step.step_id
                self._progress(step, "STARTED")

                if step.action == StepAction.NAVIGATE:
                    if step.expected_value and step.expected_value.startswith("http"):
                        await self.page.goto(step.expected_value)

                elif step.action == StepAction.TYPE:
                    assert step.target is not None
                    val = cbs_data.get(step.field_key or "", "")
                    loc = await resolve_locator(self.page, step.target, timeout_ms=step.timeout_ms)
                    await loc.click()
                    await loc.fill("")
                    if self.typing_delay_ms > 0:
                        for char in val:
                            await loc.type(char, delay=self.typing_delay_ms)
                    else:
                        await loc.fill(val)

                elif step.action == StepAction.SELECT_OPTION:
                    assert step.target is not None
                    val = cbs_data.get(step.field_key or "", "")
                    loc = await resolve_locator(self.page, step.target, timeout_ms=step.timeout_ms)
                    await loc.select_option(val)

                elif step.action == StepAction.READ_BACK:
                    await verify_dom_read_back(self.page, cbs_data)

                elif step.action == StepAction.SUBMIT:
                    assert step.target is not None
                    loc = await resolve_locator(self.page, step.target, timeout_ms=step.timeout_ms)
                    await loc.click()
                    await self.page.wait_for_timeout(1000)

                shot_b64 = None
                try:
                    shot = await self.page.screenshot(type="jpeg", quality=65)
                    self.screenshots[step.step_id] = shot
                    shot_b64 = "data:image/jpeg;base64," + base64.b64encode(shot).decode("ascii")
                except Exception:
                    pass

                self._progress(step, "COMPLETED", screenshot=shot_b64)
                if self.progress_callback and self.progress_delay_ms > 0:
                    await self.page.wait_for_timeout(self.progress_delay_ms)

            return {
                "status": JobStatus.SUBMITTED,
                "completed_steps": len(self.steps),
                "last_step_id": last_step_id,
            }

        except Exception as exc:
            if last_step_id:
                failed_step = next((step for step in self.steps if step.step_id == last_step_id), None)
                if failed_step:
                    fail_b64 = None
                    try:
                        shot = await self.page.screenshot(type="jpeg", quality=65)
                        fail_b64 = "data:image/jpeg;base64," + base64.b64encode(shot).decode("ascii")
                    except Exception:
                        pass
                    self._progress(failed_step, "FAILED", str(exc), screenshot=fail_b64)
            return {
                "status": JobStatus.FAILED,
                "failed_step_id": last_step_id,
                "error": str(exc),
            }
