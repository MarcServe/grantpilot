"use client";
import { useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { Download, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DeadlineSocialPost({ grantId, grantName }: { grantId: string; grantName: string }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"square" | "portrait">("square");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [copying, setCopying] = useState(false);
  const [caption, setCaption] = useState("");
  async function copyCaption() {
    setCopying(true);
    try {
      const response = await fetch(`/api/admin/grants/${encodeURIComponent(grantId)}/social-image?content=1`);
      const data = await response.json();
      if (!response.ok || !data.caption) throw new Error(data.error ?? "Could not load caption");
      setCaption(data.caption);
      await navigator.clipboard.writeText(data.caption);
      toast.success("Caption copied, including eligibility, funding and GrantsCopilot link");
    } catch { toast.error("Could not copy caption. You can select the caption text below if it loaded."); }
    finally { setCopying(false); }
  }
  const src = `/api/admin/grants/${encodeURIComponent(grantId)}/social-image?format=${format}`;
  return <>
    <Button type="button" size="sm" variant="outline" className="mt-3 gap-2" onClick={() => { setLoading(true); setFailed(false); setOpen(true); }}><ImageIcon className="h-4 w-4" />Create social post</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Deadline social post</DialogTitle><DialogDescription>Preview a PNG for {grantName}. Download it to share on your social channels.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2">{(["square", "portrait"] as const).map((size) => <Button type="button" key={size} size="sm" variant={format === size ? "default" : "outline"} aria-pressed={format === size} onClick={() => { if (format !== size) { setLoading(true); setFailed(false); setFormat(size); } }}>{size === "square" ? "Square · 1080 × 1080" : "Portrait · 1080 × 1350"}</Button>)}</div>
      {loading && !failed && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparing preview…</p>}
      {failed && <p role="alert" className="text-sm text-red-700">Could not generate the image. Check that the grant has a valid deadline, then reopen the preview.</p>}
      {open && <Image key={src} unoptimized src={src} alt={`Deadline announcement for ${grantName}`} width={1080} height={format === "square" ? 1080 : 1350} className="max-h-[58vh] w-auto max-w-full self-center rounded-lg object-contain" onLoad={() => setLoading(false)} onError={() => { setFailed(true); setLoading(false); }} />}
      <Button type="button" variant="outline" disabled={copying} onClick={copyCaption}>{copying ? "Preparing caption…" : "Copy full social caption"}</Button>
      {caption && <label className="text-sm font-medium">Post caption<textarea readOnly value={caption} rows={8} className="mt-2 w-full rounded-md border p-3 text-sm font-normal" /></label>}
      <Button asChild className={`gap-2 ${loading || failed ? "pointer-events-none opacity-50" : ""}`}><a href={`${src}&download=1`} download aria-disabled={loading || failed} tabIndex={loading || failed ? -1 : 0}><Download className="h-4 w-4" />Download PNG</a></Button>
    </DialogContent></Dialog>
  </>;
}
