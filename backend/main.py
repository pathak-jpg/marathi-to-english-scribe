"""
Marathi PDF -> English Translator backend.

Extracts text from an uploaded Marathi PDF with pdfplumber and translates it to
English with AI4Bharat IndicTrans2 (ai4bharat/indictrans2-indic-en-1B).

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
"""

import io
import re
from typing import List

import pdfplumber
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from IndicTransToolkit.processor import IndicProcessor
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODEL_NAME = "ai4bharat/indictrans2-indic-en-1B"
SRC_LANG = "mar_Deva"
TGT_LANG = "eng_Latn"
BATCH_SIZE = 8

app = FastAPI(title="Marathi PDF to English Translator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME, trust_remote_code=True).to(DEVICE)
model.eval()
processor = IndicProcessor(inference=True)


def extract_text(pdf_bytes: bytes) -> str:
    pages: List[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return "\n\n".join(p.strip() for p in pages if p.strip()).strip()


def split_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[।.!?])\s+", text.replace("\n", " "))
    return [p.strip() for p in parts if p.strip()]


def translate(sentences: List[str]) -> List[str]:
    outputs: List[str] = []
    for i in range(0, len(sentences), BATCH_SIZE):
        batch = processor.preprocess_batch(
            sentences[i : i + BATCH_SIZE], src_lang=SRC_LANG, tgt_lang=TGT_LANG
        )
        encoded = tokenizer(
            batch,
            truncation=True,
            padding=True,
            return_tensors="pt",
            max_length=256,
        ).to(DEVICE)
        with torch.inference_mode():
            generated = model.generate(
                **encoded, num_beams=5, max_length=256, num_return_sequences=1
            )
        decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
        outputs.extend(processor.postprocess_batch(decoded, lang=TGT_LANG))
    return outputs


@app.post("/api/translate-pdf")
async def translate_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are accepted.")

    pdf_bytes = await file.read()
    marathi_text = extract_text(pdf_bytes)
    if not marathi_text:
        raise HTTPException(
            status_code=422,
            detail="No selectable text found in this PDF (scanned PDFs need OCR).",
        )

    english = translate(split_sentences(marathi_text))
    return {
        "marathi_text": marathi_text,
        "english_translation": " ".join(english),
    }


@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE, "model": MODEL_NAME}
