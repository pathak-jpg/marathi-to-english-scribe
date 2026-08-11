import { createFileRoute } from "@tanstack/react-router";
import { extractText, getDocumentProxy } from "unpdf";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const MAX_BYTES = 15 * 1024 * 1024;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Splits long text into chunks so the translation stays accurate on big PDFs.
 */
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

export const Route = createFileRoute("/api/translate-pdf")({
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

          // ---- Optional: delegate to a self-hosted FastAPI + IndicTrans2 service ----
          const indicUrl = process.env["INDICTRANS_API_URL"];
          if (indicUrl) {
            const proxyForm = new FormData();
            proxyForm.append("file", file, file.name);
            const upstream = await fetch(
              `${indicUrl.replace(/\/$/, "")}/api/translate-pdf`,
              { method: "POST", body: proxyForm },
            );
            const body = await upstream.text();
            return new Response(body, {
              status: upstream.status,
              headers: { "Content-Type": "application/json" },
            });
          }

          // ---- Built-in path: extract text, then translate ----
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
            return json({ error: "Translation service is not configured." }, 500);
          }

          const gateway = createLovableAiGatewayProvider(apiKey);
          const chunks = chunkText(marathiText);
          const translated: string[] = [];

          for (const chunk of chunks) {
            const result = await generateText({
              model: gateway("google/gemini-3.6-flash"),
              system:
                "You are a professional Marathi to English translator. Translate the user's Marathi text into fluent, faithful English. Preserve paragraph breaks and structure. Output ONLY the English translation, with no notes, no preamble, and no transliteration.",
              prompt: chunk,
            });
            translated.push(result.text.trim());
          }

          return json({
            marathi_text: marathiText,
            english_translation: translated.join("\n\n"),
            pages: pdf.numPages,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          if (/402/.test(message)) {
            return json(
              { error: "AI credits exhausted. Please add credits to continue." },
              402,
            );
          }
          if (/429/.test(message)) {
            return json(
              { error: "Rate limit reached. Please try again in a moment." },
              429,
            );
          }
          return json({ error: `Processing failed: ${message}` }, 500);
        }
      },
    },
  },
});
