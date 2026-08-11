"""Marathi PDF -> NLP analysis -> English translation API.

Pipeline: pdfplumber -> Indic NLP normalization/sentence split/tokenize ->
L3Cube POS tagging -> Stanza dependency parsing -> IndicTrans2 translation.

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import dependency_parser
import marathi_nlp
import pdf_extractor
import pos_tagger
import translator

app = FastAPI(title="Marathi PDF NLP + Translation")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _read_pdf(file: UploadFile) -> bytes:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are accepted.")
    return await file.read()


@app.post("/api/process-pdf")
async def process_pdf(file: UploadFile = File(...)):
    """Full pipeline: extraction, NLP analysis and translation."""
    pdf_bytes = await _read_pdf(file)
    marathi_text, pages = pdf_extractor.extract_text(pdf_bytes)
    if not marathi_text:
        raise HTTPException(
            status_code=422,
            detail="No selectable text found in this PDF (scanned PDFs need OCR).",
        )

    normalized = marathi_nlp.normalize_text(marathi_text)
    sentences = marathi_nlp.split_sentences(normalized)
    sentence_tokens = marathi_nlp.tokenize_sentences(sentences)
    tokens = [
        {"sentence_index": s["sentence_index"], "token": t}
        for s in sentence_tokens
        for t in s["tokens"]
    ]
    pos_tags = pos_tagger.tag_sentences(sentence_tokens)
    dependencies = dependency_parser.parse_dependencies(normalized)
    english = translator.translate(sentences)

    return {
        "filename": file.filename,
        "pages": pages,
        "marathi_text": marathi_text,
        "normalized_text": normalized,
        "sentences": sentences,
        "tokens": tokens,
        "token_count": len(tokens),
        "pos_tags": pos_tags,
        "pos_summary": pos_tagger.pos_summary(pos_tags),
        "dependencies": dependencies,
        "english_translation": english,
    }


@app.post("/api/translate-pdf")
async def translate_pdf(file: UploadFile = File(...)):
    """Original translation-only endpoint (kept for backwards compatibility)."""
    pdf_bytes = await _read_pdf(file)
    marathi_text, _ = pdf_extractor.extract_text(pdf_bytes)
    if not marathi_text:
        raise HTTPException(
            status_code=422,
            detail="No selectable text found in this PDF (scanned PDFs need OCR).",
        )
    sentences = marathi_nlp.split_sentences(marathi_nlp.normalize_text(marathi_text))
    return {
        "marathi_text": marathi_text,
        "english_translation": translator.translate(sentences),
    }


@app.get("/health")
def health():
    return {"status": "ok", "translator": translator.MODEL_NAME, "pos": pos_tagger.MODEL_NAME}
