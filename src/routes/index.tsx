import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Check, Copy, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Marathi PDF NLP Analysis & English Translator" },
      {
        name: "description",
        content:
          "Upload a Marathi PDF to extract text, normalize it, tokenize, POS tag, dependency parse and translate it into fluent English.",
      },
      { property: "og:title", content: "Marathi PDF NLP Analysis & English Translator" },
      {
        property: "og:description",
        content:
          "Upload a Marathi PDF to extract text, normalize it, tokenize, POS tag, dependency parse and translate it into fluent English.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

interface TokenRow {
  sentence_index: number;
  token: string;
}
interface PosRow {
  sentence_index: number;
  token: string;
  pos: string;
  confidence: number | null;
}
interface DepRow {
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
interface Analysis {
  filename: string;
  pages: number;
  marathi_text: string;
  normalized_text: string;
  sentences: string[];
  tokens: TokenRow[];
  token_count: number;
  pos_tags: PosRow[];
  pos_summary: Array<{ pos: string; count: number }>;
  dependencies: DepRow[];
  english_translation: string;
  analyzed_sentences?: number;
  truncated_analysis?: boolean;
}

const PIPELINE = [
  "PDF uploaded",
  "Marathi text extracted",
  "Text normalized",
  "Sentences identified",
  "Tokenization completed",
  "POS tagging completed",
  "Dependency parsing completed",
  "English translation completed",
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={!text}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function PanelShell({
  label,
  accent,
  copyText,
  children,
}: {
  label: string;
  accent?: string;
  copyText?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[22rem] flex-col rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className={`size-2 rounded-full ${accent ?? "bg-primary"}`} />
          <h2 className="text-sm font-semibold tracking-tight">{label}</h2>
        </div>
        {copyText !== undefined && <CopyButton text={copyText} />}
      </header>
      <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
    </section>
  );
}

function TextBlock({ text, placeholder }: { text: string; placeholder: string }) {
  if (!text) return <p className="text-sm text-muted-foreground">{placeholder}</p>;
  return <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{text}</p>;
}

function PipelineSteps({ done, active }: { done: number; active: boolean }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {PIPELINE.map((step, i) => {
        const complete = i < done;
        const running = active && i === done;
        return (
          <li
            key={step}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
              complete
                ? "border-primary/30 bg-primary/5 text-foreground"
                : running
                  ? "border-border bg-muted/60 text-foreground"
                  : "border-border bg-muted/30 text-muted-foreground"
            }`}
          >
            {complete ? (
              <Check className="size-4 shrink-0 text-primary" />
            ) : running ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <span className="size-4 shrink-0 rounded-full border border-border" />
            )}
            {step}
          </li>
        );
      })}
    </ol>
  );
}

function Index() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Analysis | null>(null);

  const pick = useCallback((f: File | undefined | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only .pdf files are accepted.");
      return;
    }
    setError(null);
    setFile(f);
    setData(null);
    setStep(0);
  }, []);

  const clearAll = () => {
    setFile(null);
    setData(null);
    setError(null);
    setStep(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const run = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setData(null);
    setStep(1);
    const ticker = setInterval(() => setStep((s) => (s < PIPELINE.length - 1 ? s + 1 : s)), 2500);
    try {
      const body = new FormData();
      body.append("file", file, file.name);
      const res = await fetch("/api/process-pdf", { method: "POST", body });
      const payload = (await res.json()) as Analysis & { error?: string; detail?: string };
      if (!res.ok) throw new Error(payload.error || payload.detail || "Processing failed.");
      setData(payload);
      setStep(PIPELINE.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      clearInterval(ticker);
      setLoading(false);
    }
  };

  const tokensBySentence = new Map<number, string[]>();
  data?.tokens.forEach((t) => {
    const list = tokensBySentence.get(t.sentence_index) ?? [];
    list.push(t.token);
    tokensBySentence.set(t.sentence_index, list);
  });

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="text-center">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Prototype module 01
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Marathi PDF <span className="text-primary">&rarr;</span> NLP Analysis &amp; English
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
            Upload a Marathi PDF to extract, normalize, tokenize, POS tag, dependency parse and
            translate its contents.
          </p>
        </header>

        <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/40 hover:border-primary/50 hover:bg-muted/70"
            }`}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload className="size-5" />
            </span>
            <p className="mt-4 text-sm font-medium">Drag and drop your PDF here</p>
            <p className="mt-1 text-xs text-muted-foreground">or</p>
            <span className="mt-3 inline-flex items-center rounded-md border border-border bg-background px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
              Browse files
            </span>
            <p className="mt-3 text-xs text-muted-foreground">Only .pdf files, up to 15 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>

          {file && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
              <FileText className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.size)}
                  {data ? ` · ${data.pages} page${data.pages === 1 ? "" : "s"}` : ""}
                </p>
              </div>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={!file || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "Analyzing…" : "Extract & Analyze"}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={loading || (!file && !data)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            >
              <Trash2 className="size-4" />
              Clear
            </button>
          </div>

          {(loading || data) && (
            <div className="mt-6 border-t border-border pt-6">
              <h2 className="mb-3 text-sm font-semibold tracking-tight">Processing pipeline</h2>
              <PipelineSteps done={data ? PIPELINE.length : step} active={loading} />
            </div>
          )}
        </div>

        <div className="mt-8">
          <Tabs defaultValue="extracted">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="extracted">Extracted Text</TabsTrigger>
              <TabsTrigger value="normalized">Normalized Text</TabsTrigger>
              <TabsTrigger value="sentences">
                Sentences{data ? ` (${data.sentences.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="tokens">
                Tokens{data ? ` (${data.token_count})` : ""}
              </TabsTrigger>
              <TabsTrigger value="pos">POS Tags</TabsTrigger>
              <TabsTrigger value="dep">Dependency Parse</TabsTrigger>
              <TabsTrigger value="english">English Translation</TabsTrigger>
            </TabsList>

            <TabsContent value="extracted" className="mt-4">
              <PanelShell
                label="Extracted Marathi Text"
                accent="bg-chart-1"
                copyText={data?.marathi_text ?? ""}
              >
                <TextBlock
                  text={data?.marathi_text ?? ""}
                  placeholder="The Marathi text extracted from your PDF will appear here."
                />
              </PanelShell>
            </TabsContent>

            <TabsContent value="normalized" className="mt-4">
              <PanelShell
                label="Normalized Marathi Text"
                accent="bg-chart-2"
                copyText={data?.normalized_text ?? ""}
              >
                <TextBlock
                  text={data?.normalized_text ?? ""}
                  placeholder="Unicode-normalized, whitespace-cleaned Marathi text will appear here."
                />
              </PanelShell>
            </TabsContent>

            <TabsContent value="sentences" className="mt-4">
              <PanelShell label="Sentences" accent="bg-chart-3">
                {data?.sentences.length ? (
                  <ol className="space-y-2">
                    {data.sentences.map((s, i) => (
                      <li key={i} className="flex gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="leading-7">{s}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Detected sentences will appear here.
                  </p>
                )}
              </PanelShell>
            </TabsContent>

            <TabsContent value="tokens" className="mt-4">
              <PanelShell label={`Tokens${data ? ` · ${data.token_count} total` : ""}`}>
                {tokensBySentence.size ? (
                  <div className="space-y-4">
                    {[...tokensBySentence.entries()].map(([idx, toks]) => (
                      <div key={idx}>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Sentence {idx} · {toks.length} tokens
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {toks.map((t, i) => (
                            <span
                              key={i}
                              className="rounded-md border border-border bg-muted/50 px-2 py-1 text-sm"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Tokens will appear here.</p>
                )}
              </PanelShell>
            </TabsContent>

            <TabsContent value="pos" className="mt-4">
              <PanelShell label="POS Tags">
                {data?.pos_tags.length ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap gap-2">
                      {data.pos_summary.map((s) => (
                        <span
                          key={s.pos}
                          className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium"
                        >
                          {s.pos}: {s.count}
                        </span>
                      ))}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Sent.</TableHead>
                          <TableHead>Token</TableHead>
                          <TableHead>POS Tag</TableHead>
                          <TableHead className="w-32">Confidence</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.pos_tags.map((t, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {t.sentence_index}
                            </TableCell>
                            <TableCell>{t.token}</TableCell>
                            <TableCell className="font-mono text-xs">{t.pos}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {t.confidence == null ? "—" : t.confidence.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">POS tags will appear here.</p>
                )}
              </PanelShell>
            </TabsContent>

            <TabsContent value="dep" className="mt-4">
              <PanelShell label="Dependency Parse">
                {data?.dependencies.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Sent.</TableHead>
                        <TableHead className="w-12">ID</TableHead>
                        <TableHead>Word</TableHead>
                        <TableHead>Lemma</TableHead>
                        <TableHead>POS</TableHead>
                        <TableHead>Features</TableHead>
                        <TableHead>Head</TableHead>
                        <TableHead>Dependency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.dependencies.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {d.sentence_index}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{d.id}</TableCell>
                          <TableCell>{d.word}</TableCell>
                          <TableCell>{d.lemma}</TableCell>
                          <TableCell className="font-mono text-xs">{d.pos}</TableCell>
                          <TableCell className="max-w-[14rem] truncate text-xs text-muted-foreground">
                            {d.feats ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {d.head} {d.head_word ? `(${d.head_word})` : ""}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{d.deprel}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The dependency parse will appear here.
                  </p>
                )}
              </PanelShell>
            </TabsContent>

            <TabsContent value="english" className="mt-4">
              <PanelShell
                label="English Translation"
                copyText={data?.english_translation ?? ""}
              >
                <TextBlock
                  text={data?.english_translation ?? ""}
                  placeholder="The English translation will appear here."
                />
              </PanelShell>
            </TabsContent>
          </Tabs>
        </div>

        {data?.truncated_analysis && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            POS tagging and dependency parsing were run on the first {data.analyzed_sentences}{" "}
            sentences of {data.sentences.length}. The translation covers the whole document.
          </p>
        )}

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Module 1 of the ISL translation project &middot; text-based PDFs only (no OCR)
        </p>
      </div>
    </main>
  );
}
