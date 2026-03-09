"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, FileJson } from "lucide-react";

type Result = { ok: true; imported: number; created: number; updated: number; skipped?: number } | { error: string };

export function GrantImportUploader() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setResult({ error: "Please choose a file." });
      return;
    }
    setResult(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/admin/grants/import-file", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? "Import failed" });
        return;
      }
      setResult(data);
      inputRef.current.value = "";
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Import grants from file
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload a <strong>CSV</strong> or <strong>JSON</strong> file. CSV must have a header row with columns such as:{" "}
          <code className="rounded bg-muted px-1 py-0.5">name</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5">funder</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5">applicationUrl</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5">eligibility</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5">amount</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5">deadline</code>. JSON should be an array of grant objects.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 min-w-[200px] flex-col gap-1">
            <label htmlFor="grant-file" className="text-sm font-medium">
              File
            </label>
            <div className="flex rounded-md border bg-background">
              <span className="flex items-center gap-2 border-r px-3 py-2 text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                <FileJson className="h-4 w-4" />
              </span>
              <input
                id="grant-file"
                ref={inputRef}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                className="flex-1 rounded-r-md border-0 bg-transparent px-3 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:text-primary-foreground file:hover:bg-primary/90"
              />
            </div>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Importing…" : "Import"}
          </Button>
        </form>
        {result && (
          <div
            className={
              "rounded-md border p-3 text-sm " +
              ("error" in result
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-green-500/50 bg-green-500/10 text-green-800 dark:text-green-200")
            }
          >
            {"error" in result ? (
              <p>{result.error}</p>
            ) : (
              <p>
                Imported <strong>{result.imported}</strong> grant{result.imported !== 1 ? "s" : ""}:{" "}
                <strong>{result.created}</strong> created, <strong>{result.updated}</strong> updated
                {result.skipped != null && result.skipped > 0 && (
                  <>; <strong>{result.skipped}</strong> row{result.skipped !== 1 ? "s" : ""} skipped (invalid or duplicate URL)</>
                )}
                .
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
