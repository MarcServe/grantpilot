"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, HelpCircle } from "lucide-react";

type UrlStatus = "live" | "dead" | "expired" | "unknown";

const STATUS_CONFIG: Record<
  UrlStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  live: {
    label: "Link verified",
    className: "border-green-500/50 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300",
    Icon: CheckCircle2,
  },
  dead: {
    label: "Link broken",
    className: "border-red-500/50 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300",
    Icon: XCircle,
  },
  expired: {
    label: "Programme closed",
    className: "border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
    Icon: Clock,
  },
  unknown: {
    label: "Not verified",
    className: "border-muted text-muted-foreground",
    Icon: HelpCircle,
  },
};

export function UrlStatusBadge({
  status,
  checkedAt,
  compact = false,
}: {
  status: string | null | undefined;
  checkedAt?: string | null;
  compact?: boolean;
}) {
  const key = (status ?? "unknown") as UrlStatus;
  const config = STATUS_CONFIG[key] ?? STATUS_CONFIG.unknown;
  const { label, className, Icon } = config;

  const title = checkedAt
    ? `${label} — checked ${new Date(checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : label;

  if (compact) {
    return (
      <span title={title} className="inline-flex">
        <Icon
          className={`h-4 w-4 ${
            key === "live"
              ? "text-green-600 dark:text-green-400"
              : key === "dead"
                ? "text-red-600 dark:text-red-400"
                : key === "expired"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground"
          }`}
        />
      </span>
    );
  }

  return (
    <Badge variant="outline" className={`gap-1 ${className}`} title={title}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
