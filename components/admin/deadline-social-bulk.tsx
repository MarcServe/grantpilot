"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

export function DeadlineSocialBulk({ grants }: { grants: { id: string; name: string }[] }) {
  const [scope, setScope] = useState("upcoming");
  const [format, setFormat] = useState("both");
  const [selected, setSelected] = useState<string[]>(grants.map(grant => grant.id));
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/grants/social-bundle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, format, grantIds: selected }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = objectUrl; a.download = "grantscopilot-deadline-social-pack.zip";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      const count = response.headers.get("X-Export-Count");
      const skipped = Number(response.headers.get("X-Export-Skipped-Images"));
      if (skipped) toast.warning(`${count} grants exported. ${skipped} images failed; see README in the ZIP.`);
      else toast.success(`Social pack downloaded for ${count} grants.`);
      if (response.headers.get("X-Export-More") === "true") toast.info("More deadlines remain. Select other grants on subsequent pages to export them.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not download social pack"); }
    finally { setBusy(false); }
  }
  return <details className="rounded-lg border bg-blue-50/50 p-3">
    <summary className="cursor-pointer font-semibold">Bulk social posts & grant details</summary>
    <p className="mt-2 text-xs text-muted-foreground">Download a ZIP with captions, a CSV spreadsheet, full recorded grant details in JSON, and optional branded PNGs. Powered by GrantsCopilot and your website link are included automatically.</p>
    <label className="mt-3 block text-xs font-semibold">Grants to export<select value={scope} disabled={busy} onChange={event => setScope(event.target.value)} className="mt-1 w-full rounded-md border bg-white p-2 text-sm"><option value="upcoming">Next 7 days · nearest 25 deadlines</option><option value="selected">Choose from this page</option></select></label>
    {scope === "selected" && <fieldset className="mt-2 max-h-48 space-y-2 overflow-y-auto"><legend className="text-xs">Select grants ({selected.length})</legend>{grants.map(grant => <label key={grant.id} className="flex gap-2 text-xs"><input type="checkbox" checked={selected.includes(grant.id)} disabled={busy} onChange={event => setSelected(current => event.target.checked ? [...current, grant.id] : current.filter(id => id !== grant.id))} />{grant.name}</label>)}</fieldset>}
    <label className="mt-3 block text-xs font-semibold">Files<select value={format} disabled={busy} onChange={event => setFormat(event.target.value)} className="mt-1 w-full rounded-md border bg-white p-2 text-sm"><option value="both">Square + portrait images, captions & details</option><option value="square">Square images, captions & details</option><option value="portrait">Portrait images, captions & details</option><option value="details">Captions & details only · faster</option></select></label>
    <Button className="mt-3 w-full gap-2" size="sm" disabled={busy || (scope === "selected" && !selected.length)} onClick={download}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{busy ? "Preparing files…" : "Download social pack ZIP"}</Button>
    <p className="mt-2 text-xs text-muted-foreground">Review before posting. Images are 1080 × 1080 and 1080 × 1350. This creates files; publishing stays under your control.</p>
  </details>;
}
