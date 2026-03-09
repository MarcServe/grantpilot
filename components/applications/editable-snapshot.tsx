"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, Save, Loader2, Pencil, X, Code, Check, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { normalizeFormFieldLabel } from "@/lib/form-field-labels";

interface SnapshotField {
  label: string;
  name: string;
  value: string;
}

interface EditableSnapshotProps {
  applicationId: string;
  fields: SnapshotField[];
  fileNames: string[];
  capturedAt?: string;
  screenshotBase64?: string;
  grantUrl?: string;
  editable: boolean;
}

export function EditableSnapshot({
  applicationId,
  fields: initialFields,
  fileNames,
  capturedAt,
  screenshotBase64,
  grantUrl,
  editable,
}: EditableSnapshotProps) {
  const [fields, setFields] = useState(initialFields);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingToProfile, setSavingToProfile] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleFieldChange = useCallback((index: number, value: string) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], value };
      return next;
    });
    setDirty(true);
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/snapshot`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save edits");
        return;
      }
      toast.success("Edits saved — these values will be used when submitting");
      setDirty(false);
      setEditing(false);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveToProfile() {
    setSavingToProfile(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/save-to-profile`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save to profile");
        return;
      }
      toast.success("Answers saved to your profile — they’ll be used for future applications.");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSavingToProfile(false);
    }
  }

  const bookmarkletCode = `javascript:void(${encodeURIComponent(
    `(function(){var f=${JSON.stringify(fields.filter((f) => f.value))};f.forEach(function(d){var e=document.querySelector('[name="'+d.name+'"]')||document.getElementById(d.name);if(e&&e.type!=='file'){e.value=d.value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}});alert('Grants-Copilot: '+f.length+' fields pre-filled. Review and edit as needed.')})()`
  )})`;

  return (
    <div className="space-y-4">
      {screenshotBase64 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Filled form screenshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <img
              src={`data:image/jpeg;base64,${screenshotBase64}`}
              alt="Filled form screenshot"
              className="w-full rounded-lg border"
            />
            {capturedAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                Captured {new Date(capturedAt).toLocaleString("en-GB")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Filled data {editing && <Badge variant="outline" className="text-xs">Editing</Badge>}
            </CardTitle>
            <div className="flex items-center gap-2">
              {editable && !editing && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1">
                  <Pencil className="h-3 w-3" /> Edit values
                </Button>
              )}
              {editing && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setFields(initialFields); setDirty(false); }} className="gap-1">
                    <X className="h-3 w-3" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={!dirty || saving} className="gap-1">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save edits
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
            <p className="font-medium text-blue-900 dark:text-blue-100">How to review and approve</p>
            <ol className="mt-1 list-inside list-decimal space-y-0.5 text-blue-800 dark:text-blue-200">
              <li>Review the prefilled fields below{editable ? " — click \"Edit values\" to make changes" : ""}.</li>
              <li>Optionally use the bookmarklet to pre-fill the funder&apos;s form in your browser.</li>
              <li>When ready, tick the confirmation and click &quot;Submit Application&quot;.</li>
            </ol>
          </div>

          {fields.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={handleSaveToProfile}
                disabled={savingToProfile}
              >
                {savingToProfile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bookmark className="h-3 w-3" />}
                Save answers to my profile
              </Button>
              <span className="text-xs text-muted-foreground">
                Use these answers for future applications.
              </span>
            </div>
          )}

          {fields.length > 0 ? (
            <div className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              {fields.filter((f) => f.value !== "" || editing).map((f, i) => (
                <div key={`${f.name}-${i}`} className="rounded border bg-muted/30 px-3 py-2">
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {normalizeFormFieldLabel(f.label, f.name)}
                  </p>
                  {editing ? (
                    <Input
                      value={f.value}
                      onChange={(e) => handleFieldChange(i, e.target.value)}
                      className="mt-1 h-8 text-sm"
                    />
                  ) : (
                    <p className="mt-0.5 truncate font-medium">{f.value}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No form fields captured yet.</p>
          )}

          {fileNames.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Uploaded files</p>
              <ul className="list-inside list-disc text-sm">
                {fileNames.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          {dirty && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/50 p-2 text-xs text-amber-800">
              <Check className="h-3 w-3" />
              You have unsaved edits — click &quot;Save edits&quot; so the worker uses your changes when submitting.
            </div>
          )}
        </CardContent>
      </Card>

      {grantUrl && fields.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Code className="h-4 w-4" />
              Pre-fill the funder&apos;s form
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Open the funder&apos;s form, then drag the bookmarklet below to your bookmarks bar
              and click it to auto-fill the form with your data. You can then review and edit directly.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={bookmarkletCode}
                className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                onClick={(e) => { e.preventDefault(); toast.info("Drag this link to your bookmarks bar, then click it on the grant form page."); }}
              >
                <Code className="h-4 w-4" />
                Grants-Copilot Auto-Fill
              </a>
              <a
                href={grantUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                Open funder&apos;s form
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
