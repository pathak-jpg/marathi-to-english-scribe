# Marathi PDF → NLP Analysis → English Translator

Prototype module 1 of a larger ISL translation project.

**Pipeline**

```text
Marathi PDF
  ↓ PDF text extraction (pdfplumber)
  ↓ Marathi text normalization (Indic NLP Library)
  ↓ Sentence splitting
  ↓ Tokenization
  ↓ POS tagging (L3Cube-Pune Marathi POS tagger)
  ↓ Dependency parsing (Stanza)
  ↓ Marathi → English translation (AI4Bharat IndicTrans2)
English translation + full linguistic analysis
```

## Architecture

```text
backend/
├── main.py               FastAPI app, /api/process-pdf + /api/translate-pdf
├── pdf_extractor.py      pdfplumber text extraction
├── marathi_nlp.py        normalize_text / split_sentences / tokenize_marathi
├── pos_tagger.py         L3Cube-Pune Marathi POS tagging + summary
├── dependency_parser.py  Stanza tokenize, lemma, UPOS, feats, depparse
└── translator.py         IndicTrans2 Marathi → English

src/
├── routes/index.tsx              UI: upload, pipeline status, 7 result tabs
├── routes/api/process-pdf.ts     full pipeline endpoint (hosted runtime)
├── routes/api/translate-pdf.ts   original translation-only endpoint (kept)
├── lib/marathi-nlp.ts            normalization / sentence split / tokenization
└── lib/nlp-analysis.server.ts    POS tags + dependency parse (hosted runtime)
```

## NLP libraries and models

| Stage | Library / model |
| --- | --- |
| PDF extraction | [pdfplumber](https://github.com/jsvine/pdfplumber) |
| Normalization, sentence split, tokenization | [Indic NLP Library](https://github.com/anoopkunchukuttan/indic_nlp_library) (`mr`) |
| POS tagging | [l3cube-pune/marathi-pos](https://huggingface.co/l3cube-pune/marathi-pos), dataset [marathi-pos-tagger](https://huggingface.co/datasets/l3cube-pune/marathi-pos-tagger) |
| Dependency parsing | [Stanza](https://stanfordnlp.github.io/stanza/) Marathi pipeline (UD) |
| Translation | [IndicTrans2](https://github.com/AI4Bharat/IndicTrans2) `ai4bharat/indictrans2-indic-en-1B` (`mar_Deva` → `eng_Latn`) |

## Running the Python backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install git+https://github.com/VarunGumma/IndicTransToolkit.git
python -c "import stanza; stanza.download('mr')"
uvicorn main:app --port 8000
```

First start downloads ~5 GB of model weights (IndicTrans2 1B, L3Cube POS,
Stanza Marathi). A GPU is strongly recommended. Verify with
`curl http://localhost:8000/health`.

### Point the app at it

Set the `INDICTRANS_API_URL` secret (e.g. `https://your-host.example.com`).
When present, `/api/process-pdf` forwards the uploaded PDF to
`$INDICTRANS_API_URL/api/process-pdf` and returns that output unchanged.

Unset, the app uses its built-in in-runtime pipeline: the same normalization,
sentence-splitting and tokenization rules implemented in TypeScript, plus
model-generated UD POS tags, dependency relations and translation through
Lovable AI. Either way, every result is computed from the uploaded document —
nothing is hardcoded.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/process-pdf` | Full pipeline: extraction → NLP analysis → translation |
| POST | `/api/translate-pdf` | Extraction → translation only (original behaviour) |
| GET | `/health` | Backend only: status and loaded models |

Both POST endpoints accept `multipart/form-data` with a `file` field (`.pdf`, max 15 MB).

### Example response (`POST /api/process-pdf`)

```json
{
  "filename": "sample.pdf",
  "pages": 3,
  "marathi_text": "महाराष्ट्र हे भारतातील एक राज्य आहे.",
  "normalized_text": "महाराष्ट्र हे भारतातील एक राज्य आहे.",
  "sentences": ["महाराष्ट्र हे भारतातील एक राज्य आहे."],
  "tokens": [{ "sentence_index": 1, "token": "महाराष्ट्र" }],
  "token_count": 7,
  "pos_tags": [
    { "sentence_index": 1, "token": "महाराष्ट्र", "pos": "PROPN", "confidence": 0.99 }
  ],
  "pos_summary": [{ "pos": "NOUN", "count": 20 }],
  "dependencies": [
    {
      "sentence_index": 1,
      "id": 1,
      "word": "महाराष्ट्र",
      "lemma": "महाराष्ट्र",
      "pos": "PROPN",
      "feats": "Case=Nom|Gender=Neut|Number=Sing",
      "head": 6,
      "head_word": "आहे",
      "deprel": "nsubj"
    }
  ],
  "english_translation": "Maharashtra is a state in India."
}
```

## Known limitations

- Scanned/image-only PDFs return 422 — OCR is deliberately out of scope.
- The hosted runtime cannot execute Python or load the 1B/Stanza models, so it
  uses the built-in equivalent pipeline; run `backend/` for the exact
  L3Cube + Stanza + IndicTrans2 outputs.
- In the hosted pipeline, POS tagging and dependency parsing run on the first
  40 sentences of a document; translation always covers the whole document.
- Stanza's Marathi models are small (UFAL UD treebank), so lemmas and
  morphological features on rare words can be imperfect.

## Not implemented (by design)

OCR, Whisper / speech recognition, ISL avatar generation.
