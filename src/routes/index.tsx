import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Check, Copy, FileText, Loader2, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Marathi PDF to English Translator" },
      {
        name: "description",
        content:
          "Upload a Marathi PDF, extract its text and translate the contents into fluent English instantly.",
      },
      { property: "og:title", content: "Marathi PDF to English Translator" },
      {
        property: "og:description",
        content:
          "Upload a Marathi PDF, extract its text and translate the contents into fluent English instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

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

function Panel({
  label,
  accent,
  text,
  placeholder,
}: {
  label: string;
  accent: string;
  text: string;
  placeholder: string;
}) {
  return (
    <section className="flex min-h-[22rem] flex-col rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className={`size-2 rounded-full ${accent}`} />
          <h2 className="text-sm font-semibold tracking-tight">{label}</h2>
        </div>
        <CopyButton text={text} />
      </header>
      <div className="flex-1 overflow-auto px-5 py-4">
        {text ? (
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{text}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{placeholder}</p>
        )}
      </div>
    </section>
  );
}

function Index() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marathi, setMarathi] = useState("");
  const [english, setEnglish] = useState("");

  const pick = useCallback((f: File | undefined | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only .pdf files are accepted.");
      return;
    }
    setError(null);
    setFile(f);
    setMarathi("");
    setEnglish("");
  }, []);

  const clearAll = () => {
    setFile(null);
    setMarathi("");
    setEnglish("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const run = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setMarathi("");
    setEnglish("");
    try {
      const body = new FormData();
      body.append("file", file, file.name);
      const res = await fetch("/api/translate-pdf", { method: "POST", body });
      const data = (await res.json()) as {
        marathi_text?: string;
        english_translation?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) throw new Error(data.error || data.detail || "Translation failed.");
      setMarathi(data.marathi_text ?? "");
      setEnglish(data.english_translation ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="text-center">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Prototype module 01
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Marathi PDF <span className="text-primary">&rarr;</span> English Translator
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
            Upload a Marathi PDF and translate its contents into English.
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
                <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
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
              {loading ? "Extracting & translating…" : "Extract & Translate"}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={loading || (!file && !marathi && !english)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            >
              <Trash2 className="size-4" />
              Clear
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Panel
            label="Extracted Marathi Text"
            accent="bg-chart-1"
            text={marathi}
            placeholder="The Marathi text extracted from your PDF will appear here."
          />
          <Panel
            label="English Translation"
            accent="bg-primary"
            text={english}
            placeholder="The English translation will appear here."
          />
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Module 1 of the ISL translation project &middot; text-based PDFs only (no OCR)
        </p>
      </div>
    </main>
  );
}
