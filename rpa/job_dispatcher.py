"""In-process RPA queue and worker for the local banking demo."""

from __future__ import annotations

import os
import asyncio
import copy
import queue
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from rpa.models import AccountApplicationSnapshot, JobStatus


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RPAJobQueue:
    def __init__(self) -> None:
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._q: queue.Queue[Dict[str, Any] | None] = queue.Queue()
        self._jobs_lock = threading.RLock()
        self._worker: threading.Thread | None = None
        self._stop = threading.Event()
        self._cbs_base_url = "http://127.0.0.1:8995"
        self._result_handler: Callable[[str, Dict[str, Any]], None] | None = None
        self._claim_handler: Callable[[str], bool] | None = None

    def enqueue(self, request_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._jobs_lock:
            existing = self._jobs.get(request_id)
            if existing:
                if existing.get("status") == JobStatus.COMPLETED.value and existing.get("cif_number"):
                    return copy.deepcopy(existing)
                existing["payload"] = copy.deepcopy(payload)
                existing["status"] = JobStatus.PENDING.value
                existing["enqueued_at"] = _now()
                existing["error"] = None
                self._append_event_locked(request_id, {"phase": "QUEUED", "label": "RPA job re-queued for retry"})
                self._q.put({"request_id": request_id})
                return copy.deepcopy(existing)
            job_record = {
                "request_id": request_id,
                "payload": copy.deepcopy(payload),
                "status": JobStatus.PENDING.value,
                "enqueued_at": _now(),
                "started_at": None,
                "completed_at": None,
                "attempts": 0,
                "current_step": None,
                "events": [],
                "latest_screenshot": None,
                "cif_number": None,
                "account_number": None,
                "cbs_status": None,
                "error": None,
            }
            self._jobs[request_id] = job_record
            self._append_event_locked(request_id, {"phase": "QUEUED", "label": "RPA job queued"})
            self._q.put({"request_id": request_id})
            return copy.deepcopy(job_record)

    def has_job(self, request_id: str) -> bool:
        with self._jobs_lock:
            return request_id in self._jobs

    def get_job(self, request_id: str) -> Optional[Dict[str, Any]]:
        with self._jobs_lock:
            job = self._jobs.get(request_id)
            return copy.deepcopy(job) if job else None

    def public_job(self, request_id: str) -> Optional[Dict[str, Any]]:
        job = self.get_job(request_id)
        if not job:
            return None
        job.pop("payload", None)
        return job

    def update_job(self, request_id: str, **kwargs: Any) -> None:
        with self._jobs_lock:
            if request_id in self._jobs:
                self._jobs[request_id].update(kwargs)

    def add_event(self, request_id: str, event: Dict[str, Any]) -> None:
        with self._jobs_lock:
            if request_id not in self._jobs:
                return
            screenshot = event.pop("screenshot", None)
            if screenshot:
                self._jobs[request_id]["latest_screenshot"] = screenshot
            self._append_event_locked(request_id, event)
            if event.get("phase") == "STARTED":
                self._jobs[request_id]["current_step"] = event.get("step_id")

    def _append_event_locked(self, request_id: str, event: Dict[str, Any]) -> None:
        self._jobs[request_id]["events"].append({**event, "timestamp": _now()})

    def start_worker(self, *, cbs_base_url: str,
                     result_handler: Callable[[str, Dict[str, Any]], None],
                     claim_handler: Callable[[str], bool] | None = None) -> None:
        with self._jobs_lock:
            self._cbs_base_url = cbs_base_url.rstrip("/")
            self._result_handler = result_handler
            self._claim_handler = claim_handler
            if self._worker and self._worker.is_alive():
                return
            self._stop.clear()
            self._worker = threading.Thread(target=self._worker_loop, name="sentinel-rpa-worker", daemon=True)
            self._worker.start()

    def stop_worker(self) -> None:
        self._stop.set()
        self._q.put(None)
        worker = self._worker
        if worker and worker.is_alive():
            worker.join(timeout=5)
        self._worker = None

    def _worker_loop(self) -> None:
        while not self._stop.is_set():
            try:
                queued = self._q.get(timeout=0.5)
            except queue.Empty:
                continue
            if queued is None:
                self._q.task_done()
                break
            try:
                self._run_job(queued["request_id"])
            finally:
                self._q.task_done()

    def _run_job(self, request_id: str) -> None:
        from rpa.rpa_runner import RPARunner

        job = self.get_job(request_id)
        if not job:
            return
        if self._claim_handler and not self._claim_handler(request_id):
            self.add_event(request_id, {"phase": "SKIPPED", "label": "Already taken by another instance or no longer approved"})
            return
        payload = job["payload"]
        self.update_job(request_id, status=JobStatus.EXECUTING.value,
                        started_at=_now(), attempts=job["attempts"] + 1)
        self.add_event(request_id, {"phase": "EXECUTING", "label": "Browser automation started"})
        try:
            pan_val = payload.get("pan_number") or payload.get("pan") or ""  # the officer decision already restored it
            if not pan_val and payload.get("pan_masked"):
                masked = str(payload.get("pan_masked", "")).strip()
                if len(masked) == 10 and not masked.startswith("•"):
                    pan_val = masked

            snapshot = AccountApplicationSnapshot(
                application_reference=request_id,
                customer_name=payload.get("full_name", ""),
                pan=pan_val,
                aadhaar_last4=payload.get("document_last4") or payload.get("aadhaar_last4") or "0000",
                dob=payload.get("date_of_birth", ""),
                mobile=payload.get("mobile", ""),
                email=payload.get("email", ""),
                address_line=payload.get("address", ""),
                city=payload.get("city", ""),
                pincode=payload.get("pincode", ""),
                account_type=payload.get("account_scheme", "SAVINGS_INDIVIDUAL"),
                nominee_name=payload.get("nominee_name") or payload.get("nominee"),
                nominee_relationship=payload.get("nominee_relationship"),
            )
            headless_env = os.getenv("RPA_HEADLESS", "false").lower()
            is_headless = headless_env in ("true", "1", "yes", "on")

            runner = RPARunner(
                cbs_base_url=self._cbs_base_url,
                headless=is_headless,
                slow_mo=60 if not is_headless else 0,
                typing_delay_ms=25 if not is_headless else 8,
                progress_callback=lambda event: self.add_event(request_id, event),
                progress_delay_ms=220 if not is_headless else 100,
            )
            result = asyncio.run(runner.run_account_opening(snapshot))
            status = result.get("status")
            status_value = status.value if isinstance(status, JobStatus) else str(status)
            result["status"] = status_value
            if status_value == JobStatus.COMPLETED.value:
                self.update_job(request_id, status=status_value, completed_at=_now(),
                                current_step="AO-010", cif_number=result.get("cif_number"),
                                account_number=result.get("account_number"),
                                cbs_status=result.get("cbs_status"))
                self.add_event(request_id, {"phase": "COMPLETED", "label": "CBS accepted the maker entry"})
            else:
                self.update_job(request_id, status=JobStatus.FAILED.value,
                                completed_at=_now(), error=result.get("error"))
                self.add_event(request_id, {"phase": "FAILED", "label": "RPA run failed",
                                            "error": result.get("error")})
            if self._result_handler:
                self._result_handler(request_id, result)
        except Exception as exc:
            result = {"status": JobStatus.FAILED.value, "error": str(exc)}
            self.update_job(request_id, status=JobStatus.FAILED.value,
                            completed_at=_now(), error=str(exc))
            self.add_event(request_id, {"phase": "FAILED", "label": "RPA run failed", "error": str(exc)})
            if self._result_handler:
                self._result_handler(request_id, result)

    def clear(self) -> None:
        with self._jobs_lock:
            self._jobs.clear()
        while not self._q.empty():
            try:
                self._q.get_nowait()
                self._q.task_done()
            except queue.Empty:
                break


_QUEUE = RPAJobQueue()  # one queue per process


def get_job_queue() -> RPAJobQueue:
    return _QUEUE
