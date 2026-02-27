"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Upload, FileText, Trash2, CheckCircle } from "lucide-react";

interface DocumentItem {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

interface Step5Props {
  documents: DocumentItem[];
  onUpload: (file: File) => Promise<void>;
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

export function Step5Documents({
  documents,
  onUpload,
  onRemove,
  onBack,
  onComplete,
  isPending,
}: Step5Props) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert("File must be under 10MB");
        return;
      }

      setUploading(true);
      try {
        await onUpload(file);
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [onUpload]
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">Supporting Documents</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your pitch deck, business plan, financial accounts, or any
          other supporting documents. PDF and DOCX accepted, max 10MB each.
        </p>
      </div>

      <div className="rounded-lg border border-dashed p-8 text-center">
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          Click to upload or drag and drop
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
            type="file"
            className="hidden"
            accept=".pdf,.docx,.doc,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>

      {documents.length > 0 && (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(doc.size)}
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
