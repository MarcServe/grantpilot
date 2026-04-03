"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileText, Trash2, CheckCircle, Video } from "lucide-react";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_GROUPS } from "@/lib/document-categories";

interface DocumentItem {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  category?: string | null;
}

interface Step5Props {
  documents: DocumentItem[];
  onUpload: (file: File, category?: string | null) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onBack: () => void;
  onComplete: () => void;
  isPending: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getCategoryLabel(value: string | null | undefined): string {
  if (!value) return "Document";
  const c = DOCUMENT_CATEGORIES.find((x) => x.value === value);
  return c?.label ?? value;
}

export function Step5Documents({
  documents,
  onUpload,
  onRemove,
  onBack,
  onComplete,
  isPending,
}: Step5Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>("");

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const isVideo = (file.type || "").startsWith("video/");
      const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert(isVideo ? "Video must be under 100MB" : "File must be under 10MB");
        return;
      }

      setUploading(true);
      try {
        await onUpload(file, uploadCategory || undefined);
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [onUpload, uploadCategory]
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">Supporting Documents & Videos</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload pitch deck, business plan, financial accounts, or a pitch
          video. Many grants require a short video (e.g. 5 min, 50MB). Tag
          each file so we can match it to grant requirements.
        </p>
      </div>

      <div className="rounded-lg border border-dashed p-6">
        <div className="mb-4 flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">What type of document is this?</Label>
          <select
            id="document-upload-category"
            name="uploadCategory"
            className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={uploadCategory}
            onChange={(e) => setUploadCategory(e.target.value)}
            aria-label="What type of document is this?"
          >
            <option value="">— What type of document is this? —</option>
            {DOCUMENT_CATEGORY_GROUPS.map((group) => {
              const items = DOCUMENT_CATEGORIES.filter((c) => c.group === group);
              if (items.length === 0) return null;
              if (group === "Other") {
                return <option key="other" value="other">Other</option>;
              }
              return (
                <optgroup key={group} label={group}>
                  {items.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div className="text-center">
          <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Click to upload (documents max 10MB, videos max 100MB)
          </p>
          <label className="mt-4 inline-block cursor-pointer">
            <Button variant="outline" disabled={uploading} asChild>
              <span>
                {uploading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Choose File
              </span>
            </Button>
            <input
              id="document-file-upload"
              name="documentFile"
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.xlsx,.xls,video/*,.mp4,.webm,.mov"
              onChange={handleFileChange}
              disabled={uploading}
              aria-label="Upload document"
            />
          </label>
        </div>
      </div>

      {documents.length > 0 && (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  {(doc.type || "").startsWith("video/") ? (
                    <Video className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(doc.size)}
                      {doc.category ? ` · ${getCategoryLabel(doc.category)}` : ""}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(doc.id)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onComplete} disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="mr-2 h-4 w-4" />
          )}
          Complete Profile
        </Button>
      </div>
    </div>
  );
}
