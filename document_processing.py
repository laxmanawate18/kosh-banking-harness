"""Bounded, encrypted evidence and Google Cloud OCR. OCR is never identity proof."""
from __future__ import annotations
import base64
import io
import os
import re
import warnings
from pathlib import Path

from cryptography.fernet import Fernet
from backend.settings import PRODUCTION
from PIL import Image, ImageOps
from pypdf import PdfReader

MAX_BYTES = 8 * 1024 * 1024
DOCUMENT_TYPES = {"PAN", "FORM_60", "AADHAAR", "PASSPORT", "VOTER_ID", "DRIVING_LICENSE", "NREGA_JOB_CARD", "NPR_LETTER"}


def cipher():
    key = os.getenv("SENTINEL_DOCUMENT_KEY")
    if not key and PRODUCTION:  # a per-container key is lost on every redeploy, making stored documents unreadable
        raise RuntimeError("SENTINEL_DOCUMENT_KEY must be set in production")
    if not key:
        path = Path(os.getenv("SENTINEL_DOCUMENT_KEY_FILE", str(Path(__file__).parent / "data" / "documents.key")))
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "wb") as handle:
                handle.write(Fernet.generate_key())
        key = path.read_bytes()
    return Fernet(key.encode() if isinstance(key, str) else key)


def redact(text):
    # Aadhaar-like sequences must not enter logs, agent prompts or OCR metadata.
    return re.sub(r"(?<!\d)(?:\d[ -]?){11}\d(?!\d)", lambda m: "XXXX XXXX " + re.sub(r"\D", "", m[0])[-4:], str(text))


def validate_file(encoded, mime):
    if len(encoded) > MAX_BYTES * 4 // 3 + 8:
        raise ValueError("Document must be no larger than 8 MB")
    try:
        raw = base64.b64decode(encoded.split(",", 1)[-1], validate=True)
    except (ValueError, TypeError) as exc:
        raise ValueError("The file could not be decoded") from exc
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError("Upload a document between 1 byte and 8 MB")
    if mime in {"image/jpeg", "image/png"}:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(raw)) as original:
                    if original.format not in {"JPEG", "PNG"} or original.width * original.height > 24_000_000:
                        raise ValueError("Use a JPEG or PNG under 24 megapixels")
                    original.load()
                    cleaned = ImageOps.exif_transpose(original).convert("RGB")
                    out = io.BytesIO()
                    cleaned.save(out, format="JPEG", quality=92)  # Strip EXIF / GPS and normalize input.
                    return out.getvalue(), "image/jpeg", 1
        except Exception as exc:
            raise ValueError("This image cannot be read. Upload a clear JPEG or PNG") from exc
    if mime == "application/pdf" and raw.startswith(b"%PDF-"):
        try:
            pdf = PdfReader(io.BytesIO(raw), strict=True)
            if pdf.is_encrypted or not 1 <= len(pdf.pages) <= 5:
                raise ValueError("Use an unlocked PDF with at most five pages")
            root = pdf.trailer["/Root"]
            if any(k in root for k in ("/OpenAction", "/AA")) or any(k in root.get("/Names", {}) for k in ("/JavaScript", "/EmbeddedFiles")):
                raise ValueError("Active or embedded PDF content is not accepted")
            if any("/Annots" in page or "/AA" in page for page in pdf.pages):
                raise ValueError("Upload a flattened PDF without annotations")
            return raw, mime, len(pdf.pages)
        except Exception as exc:
            raise ValueError("Use an unlocked, flattened PDF with at most five pages") from exc
    raise ValueError("Supported files: JPEG, PNG and PDF")


class CloudDocumentScanner:
    def configuration(self):
        processor = os.getenv("SENTINEL_DOCUMENT_AI_PROCESSOR", "")
        return {"provider": "GOOGLE_DOCUMENT_AI" if processor else "GOOGLE_CLOUD_VISION",
                "processing_region": processor.split("/")[3] if len(processor.split("/")) > 3 else "global",
                "max_file_mb": 8, "max_pages": 5,
                "identity_verification": "OFFICER_REQUIRED", "liveness": "PROVIDER_NOT_CONNECTED"}

    def scan(self, raw, mime, pages):
        import google.auth
        credentials, project = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        quota = os.getenv("GOOGLE_CLOUD_QUOTA_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT") or project
        if quota and hasattr(credentials, "with_quota_project"):
            credentials = credentials.with_quota_project(quota)
        processor = os.getenv("SENTINEL_DOCUMENT_AI_PROCESSOR", "")
        if processor:
            from google.cloud import documentai
            from google.api_core.client_options import ClientOptions
            if not re.fullmatch(r"projects/[\w-]+/locations/[\w-]+/processors/[\w-]+", processor):
                raise ValueError("Configure a valid Document AI processor resource name")
            location = processor.split("/")[3]
            client = documentai.DocumentProcessorServiceClient(credentials=credentials, client_options=ClientOptions(api_endpoint=f"{location}-documentai.googleapis.com"))
            result = client.process_document(request=documentai.ProcessRequest(name=processor,
                raw_document=documentai.RawDocument(content=raw, mime_type=mime),
                process_options=documentai.ProcessOptions(ocr_config=documentai.OcrConfig(enable_image_quality_scores=True))), timeout=45)
            scores = [p.image_quality_scores.quality_score for p in result.document.pages if p.image_quality_scores]
            return {"text": redact(result.document.text)[:24000], "provider": "GOOGLE_DOCUMENT_AI",
                    "quality_score": min(scores) if scores else None, "status": "TEXT_EXTRACTED"}
        from google.cloud import vision
        client = vision.ImageAnnotatorClient(credentials=credentials)
        if mime == "application/pdf":
            response = client.batch_annotate_files(request={"requests": [{"input_config": {"content": raw, "mime_type": mime},
                "features": [{"type_": vision.Feature.Type.DOCUMENT_TEXT_DETECTION}], "pages": list(range(1, pages + 1))}]}, timeout=45)
            results = response.responses[0].responses
        else:
            results = [client.document_text_detection(image=vision.Image(content=raw), timeout=45)]
        if any(r.error.message for r in results):
            raise RuntimeError("Cloud OCR could not process this document")
        text = "\n".join(r.full_text_annotation.text for r in results)
        confidence = [p.confidence for r in results for p in r.full_text_annotation.pages]
        return {"text": redact(text)[:24000], "provider": "GOOGLE_CLOUD_VISION",
                "quality_score": min(confidence) if confidence else None,
                "status": "TEXT_EXTRACTED" if text.strip() else "NO_TEXT_FOUND"}


_LABEL_LINE = re.compile(r"^(?:name|नाम)\s*[:/]?\s*(.*)$", re.I)


def basic_fields(text, doc_type):
    """Unambiguous OCR candidates only, read on the server. No model ever sees the document; the customer confirms these
    in the form, and an officer checks them against the document."""
    fields = {}
    upper = text.upper()
    if doc_type == "PAN":
        matches = set(re.findall(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", upper))
        if len(matches) == 1:
            fields["pan_number"] = matches.pop()
    match = re.search(r"(?:DOB|Date of Birth|जन्म तिथि)\s*[: /-]?\s*(\d{2})[/-](\d{2})[/-](\d{4})", text, re.I)
    if match:
        fields["date_of_birth"] = f"{match[3]}-{match[2]}-{match[1]}"
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for i, line in enumerate(lines):  # "Name: X" on one line, or a "Name" label with the value on the next line
        label = _LABEL_LINE.match(line)
        if label:
            candidate = label[1] or (lines[i + 1] if i + 1 < len(lines) else "")
            if re.fullmatch(r"[A-Za-z][A-Za-z .'-]{1,78}", candidate):
                fields["full_name"] = " ".join(candidate.split()).title()
                break
    if doc_type in {"AADHAAR", "VOTER_ID", "DRIVING_LICENSE", "PASSPORT", "NPR_LETTER"}:
        address = re.search(r"(?:Address|पता)\s*[:]?\s*(.+?\b[1-9]\d{5}\b)", text, re.I | re.S)
        if address:
            fields["address"] = " ".join(address[1].split())[:240]
        pincodes = set(re.findall(r"\b[1-9]\d{5}\b", text))
        if len(pincodes) == 1:
            fields["pincode"] = pincodes.pop()
    if doc_type == "AADHAAR":
        last4 = re.findall(r"XXXX XXXX (\d{4})", text)  # redact() already replaced the full number
        if len(set(last4)) == 1:
            fields["document_last4"] = last4[0]
    return fields
