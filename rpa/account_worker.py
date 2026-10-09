"""Runs the account-opening robot for queued applications, one at a time, and moves each application through its states.

The database decides what runs: every reference is claimed first (only one instance ever keys it into the core), and
after a restart account_applications.requeue_stale() puts back anything that never finished. Progress events (without
screenshots) are kept on the application; the latest screenshot stays in memory for the officer's live view.
"""

from __future__ import annotations

import asyncio
import logging
import queue
import threading
from typing import Any, Callable, Optional

logger = logging.getLogger("kosh.rpa")


class AccountRobotWorker:
    def __init__(self, service, db, base_url: str, robot_factory: Optional[Callable[..., Any]] = None):
        self.service, self.db, self.base_url = service, db, base_url
        self.robot_factory = robot_factory or _default_robot
        self.latest_screenshot: dict[str, str] = {}
        self._queue: "queue.Queue[str]" = queue.Queue()
        self._thread: Optional[threading.Thread] = None

    def enqueue(self, reference: str) -> None:
        self._queue.put(reference)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, name="account-robot", daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        while True:
            reference = self._queue.get()
            try:
                self.process(reference)
            except Exception:  # one application's failure must never stop the worker
                logger.exception("Account robot crashed on %s", reference)
            finally:
                self._queue.task_done()

    def process(self, reference: str) -> Optional[dict[str, Any]]:
        """Claim, run the robot, and record the outcome. Returns the application as it ends, or None if not claimed."""
        from account_applications import ApplicationError, mirror_opened
        from rpa.account_robot import CoreRefused
        if not self.service.claim(reference):
            return None
        application = self.service.get(reference)
        payload = self.service.payload(reference)

        def progress(event: dict[str, Any]) -> None:
            if event.get("screenshot"):
                self.latest_screenshot[reference] = event["screenshot"]
            self.service.note_progress(reference, {k: v for k, v in event.items() if k != "screenshot"})

        def maker_saved(maker_reference: str, cif: str) -> None:
            self.service.maker_done(reference, maker_reference=maker_reference, cif_number=cif)

        try:
            context = self._context(application, payload)
            robot = self.robot_factory(self.base_url, progress=progress)
            core = asyncio.run(robot.run({**application, "payload": payload}, context, maker_saved))
        except CoreRefused as refusal:
            return self.service.failed(reference, error=str(refusal), refused_by_core=True)
        except Exception as exc:
            logger.warning("Account robot failed on %s: %r", reference, exc)
            return self.service.failed(reference, error=f"{type(exc).__name__}: {exc}")
        try:
            if self.service.get(reference)["status"] == "RPA_EXECUTING":  # authorised by an earlier run that stopped
                self.service.maker_done(reference, maker_reference=core.get("fd_number") or core["account_number"],
                                        cif_number=core["cif_number"])
            self.service.authorised(reference, checker_reference=core["checker_reference"], cif_number=core["cif_number"],
                                    account_number=core.get("account_number"), fd_number=core.get("fd_number"))
            customer_id = mirror_opened(self.db, application, payload, core)
            return self.service.opened(reference, customer_id=customer_id)
        except ApplicationError as exc:  # opened in the core, but Kosh could not mirror it: an officer must look
            logger.error("Core opened %s but Kosh could not record it: %s", reference, exc)
            self.service.note_progress(reference, {"step": "MIRROR", "phase": "FAILED", "label": str(exc)})
            return self.service.get(reference)

    def _context(self, application: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        """What the robot needs from Kosh: the existing customer's CIF and, for an FD, the funding account's core number."""
        if application["track"] != "EXISTING_CUSTOMER":
            return {}
        snapshot = self.db.snapshot()
        customer = snapshot.get("customers", {}).get(application["customer_id"]) or {}
        if not customer.get("cif_number"):
            raise RuntimeError("This customer has no CIF recorded in Kosh")
        context = {"cif": customer["cif_number"]}
        if application["kind"] == "FD":
            funding = snapshot.get("accounts", {}).get(str(payload.get("funding_account_id", "")).upper()) or {}
            if not funding.get("cbs_account_number"):
                raise RuntimeError("The funding account has no core account number recorded in Kosh")
            context["funding_account"] = funding["cbs_account_number"]
        return context


def _default_robot(base_url: str, progress):
    from rpa.account_robot import AccountRobot
    return AccountRobot(base_url, progress=progress)
