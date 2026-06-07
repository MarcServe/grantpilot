"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Loader2, Plus, RefreshCcw, Rss, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SourceType = "rss" | "government_portal" | "foundation" | "newsletter";
type CrawlFrequency = "6h" | "24h" | "72h" | "168h";

type GrantSource = {
  id: string;
  source_name: string | null;
  country: string | null;
  type: SourceType | string | null;
  endpoint: string | null;
  crawl_frequency: CrawlFrequency | string | null;
  enabled: boolean | null;
  last_crawled_at: string | null;
  adapter: string | null;
  updated_at: string | null;
};

const SOURCE_PAGE_SIZE = 20;

const sourceTypeOptions: { value: SourceType; label: string; help: string }[] = [
  { value: "rss", label: "RSS feed", help: "Structured feed parsed directly into grant candidates." },
  { value: "government_portal", label: "Grant page / portal", help: "Website page crawled with AI extraction." },
  { value: "foundation", label: "Foundation page", help: "Foundation or charity funding page." },
  { value: "newsletter", label: "Newsletter / listing", help: "Funding digest, listing, or curated page." },
];

function formatRelative(value?: string | null): string {
  if (!value) return "Never crawled";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Never crawled";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function sourceTypeLabel(type?: string | null): string {
  return sourceTypeOptions.find((option) => option.value === type)?.label ?? type ?? "Source";
}

export function GrantSourceManager() {
  const [sources, setSources] = useState<GrantSource[]>([]);
  const [page, setPage] = useState(1);
  const [totalSources, setTotalSources] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [country, setCountry] = useState("UK");
  const [type, setType] = useState<SourceType>("rss");
  const [crawlFrequency, setCrawlFrequency] = useState<CrawlFrequency>("24h");

  const loadSources = useCallback(async (nextPage = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/grant-sources?page=${nextPage}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Failed to load grant sources");
      }
      setSources(((data as { sources?: GrantSource[] }).sources ?? []) as GrantSource[]);
      setPage(Number((data as { page?: number }).page ?? nextPage));
      setTotalSources(Number((data as { total?: number }).total ?? 0));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load grant sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const enabledCount = useMemo(() => sources.filter((source) => source.enabled).length, [sources]);

  async function addSource() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/grant-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceName,
          endpoint,
          country,
          type,
          crawlFrequency,
          enabled: true,
          markDueNow: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Could not save source");
      }
      toast.success((data as { message?: string }).message ?? "Grant source saved");
      setSourceName("");
      setEndpoint("");
      await loadSources(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save source");
    } finally {
      setSaving(false);
    }
  }

  async function updateSource(id: string, payload: { enabled?: boolean; markDueNow?: boolean }) {
    setUpdatingId(id);
    try {
      const res = await fetch("/api/admin/grant-sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Could not update source");
      }
      toast.success(
        payload.markDueNow
          ? "Source marked due for the next crawler run"
          : (data as { message?: string }).message ?? "Source updated"
      );
      await loadSources(page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update source");
    } finally {
      setUpdatingId(null);
    }
  }

  const selectedType = sourceTypeOptions.find((option) => option.value === type);
  const totalPages = Math.max(1, Math.ceil(totalSources / SOURCE_PAGE_SIZE));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rss className="h-5 w-5" />
          Manual grant sources
        </CardTitle>
        <CardDescription>
          Add RSS feeds or grant pages to the source registry. New entries are marked due immediately and will be
          processed by the existing source crawler.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)]">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="grant-source-name">Source name</Label>
              <Input
                id="grant-source-name"
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
                placeholder="Innovate UK funding RSS"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-source-country">Country / region</Label>
              <Input
                id="grant-source-country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="UK, EU, US, Global"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="grant-source-url">RSS or grant source URL</Label>
              <Input
                id="grant-source-url"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="https://example.org/funding/rss.xml"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Source type</Label>
              <Select value={type} onValueChange={(value) => setType(value as SourceType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sourceTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Crawl frequency</Label>
              <Select value={crawlFrequency} onValueChange={(value) => setCrawlFrequency(value as CrawlFrequency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6h">Every 6 hours</SelectItem>
                  <SelectItem value="24h">Daily</SelectItem>
                  <SelectItem value="72h">Every 3 days</SelectItem>
                  <SelectItem value="168h">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Database className="h-4 w-4 text-blue-600" />
              Source behaviour
            </div>
            <p className="mt-2 text-muted-foreground">
              {selectedType?.help} The crawler deduplicates grants during import and updates existing records when a
              source repeats a grant.
            </p>
            <Button
              type="button"
              onClick={addSource}
              disabled={saving || !sourceName.trim() || !endpoint.trim()}
              className="mt-4 w-full gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add source
            </Button>
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="flex flex-col justify-between gap-2 border-b p-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium">Source registry</p>
              <p className="text-xs text-muted-foreground">
                {enabledCount} enabled in this batch - {sources.length} shown of {totalSources}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void loadSources(page)} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadSources(Math.max(1, page - 1))}
                disabled={loading || page <= 1}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadSources(Math.min(totalPages, page + 1))}
                disabled={loading || page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">URL</th>
                  <th className="px-3 py-2 font-medium">Frequency</th>
                  <th className="px-3 py-2 font-medium">Last crawl</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Loading sources
                    </td>
                  </tr>
                ) : sources.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      No grant sources found.
                    </td>
                  </tr>
                ) : (
                  sources.map((source) => (
                    <tr key={source.id} className="border-b last:border-0">
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium">{source.source_name ?? "Untitled source"}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {source.country && <Badge variant="outline">{source.country}</Badge>}
                          <Badge variant={source.enabled ? "default" : "outline"}>
                            {source.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div>{sourceTypeLabel(source.type)}</div>
                        <div className="text-xs text-muted-foreground">{source.adapter ?? "auto"}</div>
                      </td>
                      <td className="max-w-[320px] px-3 py-3 align-top">
                        {source.endpoint ? (
                          <a
                            href={source.endpoint}
                            target="_blank"
                            rel="noreferrer"
                            className="break-words text-blue-700 underline-offset-2 hover:underline"
                          >
                            {source.endpoint}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">No URL</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">{source.crawl_frequency ?? "24h"}</td>
                      <td className="px-3 py-3 align-top text-muted-foreground">
                        {formatRelative(source.last_crawled_at)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={updatingId === source.id}
                            onClick={() => void updateSource(source.id, { markDueNow: true })}
                            className="gap-1.5"
                          >
                            {updatingId === source.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCcw className="h-4 w-4" />
                            )}
                            Run next
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={updatingId === source.id}
                            onClick={() => void updateSource(source.id, { enabled: !source.enabled })}
                            className="gap-1.5"
                          >
                            {source.enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                            {source.enabled ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
