import { createFileRoute } from "@tanstack/react-router";
import { extractText, getDocumentProxy } from "unpdf";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { normalizeText, splitSentences, tokenizeSentences } from "@/lib/marathi-nlp";
import { analyzeSentences, posSummary } from "@/lib/nlp-analysis.server";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ANALYZED_SENTENCES = 40;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function chunkText(text: string, size = 3500): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > size && current) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

export const Route = createFileRoute("/api/process-pdf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const file = form.get("file");

          if (!(file instanceof File)) {
            return json({ error: "No PDF file was uploaded." }, 400);
          }
          if (!file.name.toLowerCase().endsWith(".pdf")) {
            return json({ error: "Only .pdf files are accepted." }, 400);
          }
          if (file.size > MAX_BYTES) {
            return json({ error: "PDF is too large (max 15 MB)." }, 400);
          }

          // ---- Optional: delegate to the FastAPI backend (Indic NLP + L3Cube + Stanza + IndicTrans2)
          const indicUrl = process.env["INDICTRANS_API_URL"];
          if (indicUrl) {
            const proxyForm = new FormData();
            proxyForm.append("file", file, file.name);
            const upstream = await fetch(`${indicUrl.replace(/\/$/, "")}/api/process-pdf`, {
              method: "POST",
              body: proxyForm,
            });
            const body = await upstream.text();
            return new Response(body, {
              status: upstream.status,
              headers: { "Content-Type": "application/json" },
            });
          }

          // ---- 1. PDF text extraction
          const buffer = new Uint8Array(await file.arrayBuffer());
          const pdf = await getDocumentProxy(buffer);
          const { text: rawText } = await extractText(pdf, { mergePages: true });
          const marathiText = String(rawText ?? "")
            .replace(/[ \t]+\n/g, "\n")
            .trim();

          if (!marathiText) {
            return json(
              {
                error:
                  "No selectable text found in this PDF. It may be a scanned image (OCR is not part of this module).",
              },
              422,
            );
          }

          const apiKey = process.env["LOVABLE_API_KEY"];
          if (!apiKey) {
            return json({ error: "Analysis service is not configured." }, 500);
          }

          // ---- 2-4. Normalization, sentence splitting, tokenization
          const normalized = normalizeText(marathiText);
          const sentences = splitSentences(normalized);
          const sentenceTokens = tokenizeSentences(sentences);
          const tokens = sentenceTokens.flatMap((s) =>
            s.tokens.map((token) => ({ sentence_index: s.sentence_index, token })),
          );

          // ---- 5-6. POS tagging + dependency parsing
          const analyzed = sentenceTokens.slice(0, MAX_ANALYZED_SENTENCES);
          const { pos_tags, dependencies } = await analyzeSentences(apiKey, analyzed);

          // ---- 7. Marathi -> English translation
          const gateway = createLovableAiGatewayProvider(apiKey);
          const translated: string[] = [];
          for (const chunk of chunkText(normalized)) {
            const result = await generateText({
              model: gateway("google/gemini-3.6-flash"),
              system:
                "You are a professional Marathi to English translator. Translate the user's Marathi text into fluent, faithful English. Preserve paragraph breaks and structure. Output ONLY the English translation, with no notes, no preamble, and no transliteration.",
              prompt: chunk,
            });
            translated.push(result.text.trim());
          }

          return json({
            filename: file.name,
            pages: pdf.numPages,
            marathi_text: marathiText,
            normalized_text: normalized,
            sentences,
            tokens,
            token_count: tokens.length,
            pos_tags,
            pos_summary: posSummary(pos_tags),
            dependencies,
            english_translation: translated.join("\n\n"),
            analyzed_sentences: analyzed.length,
            truncated_analysis: sentences.length > analyzed.length,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          if (/402|payment required|insufficient|credit/i.test(message)) {
            return json(
              {
                error:
                  "AI credits exhausted for this workspace. Add credits in Lovable (Settings → Workspace → Billing) to keep translating.",
              },
              402,
            );
          }
          if (/429|rate limit|too many requests/i.test(message)) {
            return json({ error: "Rate limit reached. Please try again in a moment." }, 429);
          }
          return json({ error: `Processing failed: ${message}` }, 500);
        }
      },
    },
  },
});
