# Marathi PDF → English Translator

Prototype module 1 of a larger ISL translation project.

**Flow:** Marathi PDF → extract text → translate Marathi → English → display both.

## How it runs here

The app ships with a working endpoint at `POST /api/translate-pdf` (TypeScript,
runs in the app's serverless runtime):

1. Receives the uploaded PDF (multipart `file` field).
2. Extracts the text of every page.
3. Translates the Marathi text to English through Lovable AI.
4. Returns:

```json
{
  "marathi_text": "महाराष्ट्र हे भारतातील एक राज्य आहे.",
  "english_translation": "Maharashtra is a state in India."
}
```

Nothing is hardcoded — the response always comes from the uploaded document.

Scanned/image-only PDFs return a 422 error, since OCR is deliberately out of scope.

## Using the Python FastAPI + IndicTrans2 backend

The hosted runtime cannot execute Python or load the 1B-parameter IndicTrans2
model, so the reference backend lives in `backend/` and the app can proxy to it.

### 1. Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

It uses:

- [`pdfplumber`](https://github.com/jsvine/pdfplumber) for per-page text extraction
- [AI4Bharat IndicTrans2](https://github.com/AI4Bharat/IndicTrans2), model
  [`ai4bharat/indictrans2-indic-en-1B`](https://huggingface.co/ai4bharat/indictrans2-indic-en-1B)
  (`mar_Deva` → `eng_Latn`)

First start downloads ~4.5 GB of model weights. A GPU is strongly recommended;
CPU works but is slow. `IndicTransToolkit` provides the required pre/post
processor:

```bash
pip install git+https://github.com/VarunGumma/IndicTransToolkit.git
```

Verify with `curl http://localhost:8000/health`.

### 2. Point the app at it

Set the `INDICTRANS_API_URL` secret (e.g. `https://your-host.example.com`).
When present, `/api/translate-pdf` forwards the uploaded PDF to
`$INDICTRANS_API_URL/api/translate-pdf` and returns IndicTrans2's output
unchanged. Unset it to fall back to the built-in translator.

## Not implemented (by design)

POS tagging, tokenization, dependency parsing, OCR, Whisper, speech recognition,
ISL avatar.
