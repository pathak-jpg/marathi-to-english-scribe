"""Marathi POS tagging with the L3Cube-Pune Marathi POS tagger.

Model: l3cube-pune/marathi-pos (trained on the marathi-pos-tagger dataset,
https://huggingface.co/datasets/l3cube-pune/marathi-pos-tagger).
"""

import os
from typing import Dict, List

import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer

MODEL_NAME = os.environ.get("MARATHI_POS_MODEL", "l3cube-pune/marathi-pos")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
_model = AutoModelForTokenClassification.from_pretrained(MODEL_NAME).to(DEVICE)
_model.eval()


def tag_tokens(tokens: List[str]) -> List[Dict]:
    """Return [{token, pos, confidence}] for a list of Marathi tokens."""
    if not tokens:
        return []

    encoded = _tokenizer(
        tokens,
        is_split_into_words=True,
        return_tensors="pt",
        truncation=True,
        max_length=512,
    ).to(DEVICE)

    with torch.inference_mode():
        logits = _model(**encoded).logits[0]

    probs = torch.softmax(logits, dim=-1)
    word_ids = encoded.word_ids(0)

    results: List[Dict] = []
    seen = set()
    for idx, word_id in enumerate(word_ids):
        if word_id is None or word_id in seen:
            continue
        seen.add(word_id)
        score, label_id = torch.max(probs[idx], dim=-1)
        results.append(
            {
                "token": tokens[word_id],
                "pos": _model.config.id2label[int(label_id)],
                "confidence": round(float(score), 4),
            }
        )

    # tokens beyond the 512 sub-token window
    for i in range(len(results), len(tokens)):
        results.append({"token": tokens[i], "pos": "X", "confidence": None})

    return results


def tag_sentences(sentence_tokens: List[Dict]) -> List[Dict]:
    """Tag every sentence: [{sentence_index, token, pos, confidence}]."""
    out: List[Dict] = []
    for item in sentence_tokens:
        for tagged in tag_tokens(item["tokens"]):
            out.append({"sentence_index": item["sentence_index"], **tagged})
    return out


def pos_summary(pos_tags: List[Dict]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for t in pos_tags:
        counts[t["pos"]] = counts.get(t["pos"], 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: kv[1], reverse=True))
