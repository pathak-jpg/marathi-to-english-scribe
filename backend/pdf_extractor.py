"""PDF text extraction using pdfplumber."""

import io
from typing import List, Tuple

import pdfplumber


def extract_text(pdf_bytes: bytes) -> Tuple[str, int]:
    """Return (full_text, page_count) for a PDF given as bytes."""
    pages: List[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page_count = len(pdf.pages)
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    text = "\n\n".join(p.strip() for p in pages if p.strip()).strip()
    return text, page_count
