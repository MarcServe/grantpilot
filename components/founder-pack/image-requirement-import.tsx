"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { requirementsToQuestionText, type ExtractedRequirements } from "@/lib/image-requirements";

async function imageData(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 15_000_000) throw new Error("Use JPEG, PNG or WebP images up to 15 MB each. Convert HEIC photos first.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Could not prepare the photo.");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.87);
  } finally { bitmap.close(); }
}
export function ImageRequirementImport({ onImport, disabled }: { onImport: (text: string) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [result, setResult] = useState<ExtractedRequirements | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  async function read(files: FileList | null) {
    if (!files?.length) return;
    setError(""); setResult(null);
    if (files.length > 3) { setError("Read up to three images at a time, in page order."); return; }
    setBusy(true);
    try {
      const images = await Promise.all(Array.from(files).map(imageData));
      const response = await fetch("/api/founder-pack/extract-requirements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Image reading failed.");
      setResult(body); setSelected(body.items.map((_: unknown, index: number) => index));
    } catch (error) { setError(error instanceof Error ? error.message : "Image reading failed."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <div className="min-w-0 space-y-3 rounded-lg border bg-white p-3">
    <p className="text-sm font-semibold">Read questions or document requirements from pictures</p>
    <p className="text-xs text-muted-foreground">Upload up to 3 screenshots/photos in page order, or take a photo. Review the extracted text before generating. Images are sent to the AI reader and are not saved to Data Vault.</p>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || disabled} aria-label="Upload requirements images" onChange={event => void read(event.target.files)} className="block w-full min-w-0 text-sm"/>
    <label className="inline-block text-sm">Or take a photo <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy || disabled} aria-label="Take a photo of requirements" onChange={event => void read(event.target.files)}/></label>
    {busy && <p role="status" className="text-sm">Reading images and separating questions and documents…</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {result && <div className="space-y-2">
      <p className="text-sm font-medium">{result.items.length} questions or documents found. Confirm these against the original.</p>
      {result.background && <p className="text-xs">Background guidance: {result.background}</p>}
      {result.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-900">{warning}</p>)}
      <ul className="max-h-80 space-y-2 overflow-y-auto">{result.items.map((item, index) => <li key={index} className="rounded border p-2 text-sm"><label className="flex gap-2"><input type="checkbox" checked={selected.includes(index)} onChange={event => setSelected(current => event.target.checked ? [...current, index] : current.filter(i => i !== index))}/><span>{item.title} · {item.kind}{item.wordLimit ? ` · ${item.wordLimit} words` : ""}</span></label><details className="mt-1"><summary>Review extracted wording</summary><p className="whitespace-pre-wrap text-xs">{item.requirements}</p></details></li>)}</ul>
      <Button type="button" variant="outline" disabled={disabled || !selected.length} onClick={() => { onImport(requirementsToQuestionText(result.items.filter((_, i) => selected.includes(i)))); setResult(null); }}>Add selected items to the editable question list</Button>
    </div>}
  </div>;
}
