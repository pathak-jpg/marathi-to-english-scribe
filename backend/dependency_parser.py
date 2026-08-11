"""Marathi dependency parsing with Stanza (https://stanfordnlp.github.io/stanza/).

Provides tokenization, lemmatization, UPOS, morphological features and
dependency relations.
"""

from typing import Dict, List

import stanza

LANG = "mr"

try:
    _nlp = stanza.Pipeline(
        lang=LANG,
        processors="tokenize,pos,lemma,depparse",
        tokenize_no_ssplit=False,
        download_method=stanza.DownloadMethod.REUSE_RESOURCES,
        verbose=False,
    )
except Exception:  # first run: download the Marathi models
    stanza.download(LANG, verbose=False)
    _nlp = stanza.Pipeline(
        lang=LANG,
        processors="tokenize,pos,lemma,depparse",
        verbose=False,
    )


def parse_dependencies(text: str) -> List[Dict]:
    """Return a flat list of parsed words with head/deprel information."""
    if not text.strip():
        return []

    doc = _nlp(text)
    rows: List[Dict] = []
    for s_idx, sentence in enumerate(doc.sentences, start=1):
        for word in sentence.words:
            head_word = (
                sentence.words[word.head - 1].text if word.head and word.head > 0 else "ROOT"
            )
            rows.append(
                {
                    "sentence_index": s_idx,
                    "id": word.id,
                    "word": word.text,
                    "lemma": word.lemma or word.text,
                    "pos": word.upos or "X",
                    "xpos": word.xpos,
                    "feats": word.feats,
                    "head": word.head,
                    "head_word": head_word,
                    "deprel": word.deprel,
                }
            )
    return rows
