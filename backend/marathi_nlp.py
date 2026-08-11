"""Marathi normalization, sentence splitting and tokenization.

Uses the Indic NLP Library (https://github.com/anoopkunchukuttan/indic_nlp_library).
"""

from typing import List

from indicnlp.normalize.indic_normalize import IndicNormalizerFactory
from indicnlp.tokenize import indic_tokenize, sentence_tokenize

LANG = "mr"

_normalizer = IndicNormalizerFactory().get_normalizer(LANG)


def normalize_text(text: str) -> str:
    """Unicode-normalize Marathi text and clean up whitespace."""
    lines = [_normalizer.normalize(line).strip() for line in text.splitlines()]
    cleaned = "\n".join(line for line in lines if line)
    while "\n\n\n" in cleaned:
        cleaned = cleaned.replace("\n\n\n", "\n\n")
    return cleaned.strip()


def split_sentences(text: str) -> List[str]:
    """Split normalized Marathi text into sentences."""
    sentences: List[str] = []
    for block in text.split("\n"):
        block = block.strip()
        if not block:
            continue
        sentences.extend(
            s.strip() for s in sentence_tokenize.sentence_split(block, lang=LANG) if s.strip()
        )
    return sentences


def tokenize_marathi(text: str) -> List[str]:
    """Tokenize Marathi text into words and punctuation."""
    return [t for t in indic_tokenize.trivial_tokenize(text, lang=LANG) if t.strip()]


def tokenize_sentences(sentences: List[str]) -> List[dict]:
    """Tokenize per sentence: [{sentence_index, sentence, tokens}]."""
    return [
        {"sentence_index": i + 1, "sentence": s, "tokens": tokenize_marathi(s)}
        for i, s in enumerate(sentences)
    ]
