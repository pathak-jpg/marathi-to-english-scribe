"""Marathi -> English translation with AI4Bharat IndicTrans2."""

from typing import List

import torch
from IndicTransToolkit.processor import IndicProcessor
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODEL_NAME = "ai4bharat/indictrans2-indic-en-1B"
SRC_LANG = "mar_Deva"
TGT_LANG = "eng_Latn"
BATCH_SIZE = 8
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
_model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME, trust_remote_code=True).to(DEVICE)
_model.eval()
_processor = IndicProcessor(inference=True)


def translate_sentences(sentences: List[str]) -> List[str]:
    outputs: List[str] = []
    for i in range(0, len(sentences), BATCH_SIZE):
        batch = _processor.preprocess_batch(
            sentences[i : i + BATCH_SIZE], src_lang=SRC_LANG, tgt_lang=TGT_LANG
        )
        encoded = _tokenizer(
            batch, truncation=True, padding=True, return_tensors="pt", max_length=256
        ).to(DEVICE)
        with torch.inference_mode():
            generated = _model.generate(
                **encoded, num_beams=5, max_length=256, num_return_sequences=1
            )
        decoded = _tokenizer.batch_decode(generated, skip_special_tokens=True)
        outputs.extend(_processor.postprocess_batch(decoded, lang=TGT_LANG))
    return outputs


def translate(sentences: List[str]) -> str:
    return " ".join(translate_sentences(sentences))
