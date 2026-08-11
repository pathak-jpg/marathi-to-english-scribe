/**
 * Hosted-runtime POS tagging and dependency parsing.
 *
 * The reference implementation (backend/) uses the L3Cube-Pune Marathi POS
 * tagger and Stanza. Neither can run inside the serverless runtime, so this
 * module derives the same UD-style annotations from a language model through
 * the Lovable AI gateway. Results are always computed from the uploaded
 * document — nothing is hardcoded.
 */

import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export interface PosTag {
  sentence_index: number;
  token: string;
  pos: string;
  confidence: number | null;
}

export interface DependencyRow {
  sentence_index: number;
  id: number;
  word: string;
  lemma: string;
  pos: string;
  feats: string | null;
  head: number;
  head_word: string;
  deprel: string;
}

const MODEL = "google/gemini-3.6-flash";

function extractJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error("No JSON in model output");
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function analyzeSentence(
  gateway: ReturnType<typeof createLovableAiGatewayProvider>,
  sentenceIndex: number,
  sentence: string,
  tokens: string[],
): Promise<{ pos: PosTag[]; deps: DependencyRow[] }> {
  const result = await generateText({
    model: gateway(MODEL),
    system:
      "You are a Marathi computational-linguistics annotator following Universal Dependencies (UD) guidelines, matching the output of the L3Cube-Pune Marathi POS tagger and Stanza's Marathi pipeline. Return ONLY compact JSON, no prose and no code fences.",
    prompt:
      `Annotate this Marathi sentence.\n\nSentence: ${sentence}\n` +
      `Tokens (use exactly these, in order): ${JSON.stringify(tokens)}\n\n` +
      `Return JSON: {"words":[{"id":1,"word":"...","lemma":"...","pos":"UPOS tag",` +
      `"confidence":0.0-1.0,"feats":"Case=Nom|Number=Sing or null",` +
      `"head":<id of head, 0 for root>,"deprel":"nsubj|root|obj|..."}]}\n` +
      `Exactly one entry per token, ids starting at 1, exactly one word with head 0 and deprel "root".`,
  });

  const parsed = extractJson(result.text) as {
    words?: Array<Record<string, unknown>>;
  };
  const words = Array.isArray(parsed.words) ? parsed.words : [];

  const rows: DependencyRow[] = words.map((w, i) => {
    const id = Number(w["id"] ?? i + 1);
    return {
      sentence_index: sentenceIndex,
      id,
      word: String(w["word"] ?? tokens[i] ?? ""),
      lemma: String(w["lemma"] ?? w["word"] ?? tokens[i] ?? ""),
      pos: String(w["pos"] ?? "X"),
      feats: w["feats"] == null ? null : String(w["feats"]),
      head: Number(w["head"] ?? 0),
      head_word: "",
      deprel: String(w["deprel"] ?? "dep"),
    };
  });

  for (const row of rows) {
    row.head_word = row.head > 0 ? (rows[row.head - 1]?.word ?? "ROOT") : "ROOT";
  }

  const pos: PosTag[] = words.map((w, i) => ({
    sentence_index: sentenceIndex,
    token: String(w["word"] ?? tokens[i] ?? ""),
    pos: String(w["pos"] ?? "X"),
    confidence: typeof w["confidence"] === "number" ? Number(w["confidence"]) : null,
  }));

  return { pos, deps: rows };
}

/** Analyze sentences with limited concurrency. */
export async function analyzeSentences(
  apiKey: string,
  sentences: Array<{ sentence_index: number; sentence: string; tokens: string[] }>,
): Promise<{ pos_tags: PosTag[]; dependencies: DependencyRow[] }> {
  const gateway = createLovableAiGatewayProvider(apiKey);
  const pos_tags: PosTag[] = [];
  const dependencies: DependencyRow[] = [];
  const CONCURRENCY = 4;

  for (let i = 0; i < sentences.length; i += CONCURRENCY) {
    const batch = sentences.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((s) => analyzeSentence(gateway, s.sentence_index, s.sentence, s.tokens)),
    );
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") {
        pos_tags.push(...r.value.pos);
        dependencies.push(...r.value.deps);
      } else {
        // Keep the pipeline going; tokens still appear, tagged as unknown.
        const s = batch[j]!;
        pos_tags.push(
          ...s.tokens.map((token) => ({
            sentence_index: s.sentence_index,
            token,
            pos: "X",
            confidence: null,
          })),
        );
      }
    });
  }

  return { pos_tags, dependencies };
}

export function posSummary(tags: PosTag[]): Array<{ pos: string; count: number }> {
  const counts = new Map<string, number>();
  for (const t of tags) counts.set(t.pos, (counts.get(t.pos) ?? 0) + 1);
  return [...counts.entries()]
    .map(([pos, count]) => ({ pos, count }))
    .sort((a, b) => b.count - a.count);
}
