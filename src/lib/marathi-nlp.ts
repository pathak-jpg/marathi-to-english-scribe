/**
 * Marathi text normalization, sentence splitting and tokenization.
 *
 * Mirrors the behaviour of the Indic NLP Library's Marathi (`mr`) pipeline
 * (indicnlp.normalize + indicnlp.tokenize), implemented in TypeScript so it
 * can run in the hosted serverless runtime. The Python backend in `backend/`
 * uses the real Indic NLP Library.
 */

const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/g;
const DEVANAGARI_DANDA = "\u0964";
const DEVANAGARI_DOUBLE_DANDA = "\u0965";

/** Unicode (NFC) normalization + Devanagari-specific clean-up. */
export function normalizeText(text: string): string {
  let out = text.normalize("NFC");
  out = out.replace(ZERO_WIDTH, "");
  // Canonicalise nukta composites and legacy code points
  out = out
    .replace(/\u0929/g, "\u0928\u093C")
    .replace(/\u0931/g, "\u0930\u093C")
    .replace(/\u0934/g, "\u0933\u093C")
    .replace(/\u095E/g, "\u092B\u093C");
  // Collapse spaces, drop trailing spaces before line breaks, de-hyphenate
  out = out
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([\u0900-\u097F])-\n([\u0900-\u097F])/g, "$1$2");
  // Space before danda is not used in Marathi typography
  out = out.replace(new RegExp(` +([${DEVANAGARI_DANDA}${DEVANAGARI_DOUBLE_DANDA}])`, "g"), "$1");
  return out.trim();
}

/** Sentence splitting on danda / double danda / western terminators. */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  for (const block of text.split(/\n{2,}|\n/)) {
    const line = block.trim();
    if (!line) continue;
    const parts = line.match(/[^\u0964\u0965.!?]+[\u0964\u0965.!?]*/g) ?? [line];
    for (const p of parts) {
      const s = p.trim();
      if (s) sentences.push(s);
    }
  }
  return sentences;
}

/** Trivial tokenizer: words vs. punctuation, matching indic_tokenize. */
export function tokenizeMarathi(text: string): string[] {
  const matches = text.match(/[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu);
  return matches ? matches.filter((t) => t.trim().length > 0) : [];
}

export interface SentenceTokens {
  sentence_index: number;
  sentence: string;
  tokens: string[];
}

export function tokenizeSentences(sentences: string[]): SentenceTokens[] {
  return sentences.map((sentence, i) => ({
    sentence_index: i + 1,
    sentence,
    tokens: tokenizeMarathi(sentence),
  }));
}
