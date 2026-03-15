"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Building2, MapPin, ArrowRight, Users, Bookmark } from "lucide-react";

interface GrantCardProps {
  id: string;
  name: string;
  funder: string;
  amount: number | null;
  deadline: string | null;
  sectors: string[];
  regions: string[];
  applicantTypes?: string[];
  matchScore?: number;
  matchReason?: string;
  urgencyLevel?: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  urgencyLabel?: string;
  /** When the grant was added to the database (ISO string). */
  addedAt?: string | null;
  isSaved?: boolean;
  onToggleSave?: () => void;
}

const URGENCY_CLASS: Record<string, string> = {
  HIGH: "border-red-500/50 bg-red-50 text-red-800 dark:bg-red-950/30",
  MEDIUM: "border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-950/30",
  LOW: "border-muted text-muted-foreground",
};

export function GrantCard({
  id,
  name,
  funder,
  amount,
  deadline,
  sectors,
  regions,
  applicantTypes,
  matchScore,
  matchReason,
  urgencyLevel,
  urgencyLabel,
  addedAt,
  isSaved,
  onToggleSave,
}: GrantCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg">{name}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                {funder}
              </span>
              {addedAt && (
                <span className="text-xs">
                  Added {new Date(addedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onToggleSave && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => { e.preventDefault(); onToggleSave(); }}
                title={isSaved ? "Remove from saved" : "Save to my list"}
              >
                <Bookmark
                  className={`h-4 w-4 ${isSaved ? "fill-primary text-primary" : ""}`}
                />
              </Button>
            )}
            {matchScore !== undefined && (
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ${
                matchScore >= 70
                  ? "bg-accent"
                  : matchScore >= 40
                    ? "bg-secondary"
                    : "bg-muted-foreground"
              }`}
            >
              {matchScore}%
            </div>
          )}
          </div>
        </div>
        {isSaved && (
          <Badge variant="secondary" className="mt-2 w-fit text-xs">
            Saved
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {amount && (
            <Badge variant="secondary">
              Up to {amount.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })}
            </Badge>
          )}
          {deadline && (
            <Badge variant="outline" className="gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(deadline).toLocaleDateString("en-GB")}
            </Badge>
          )}
          {urgencyLevel && urgencyLevel !== "NONE" && urgencyLabel && (
            <Badge variant="outline" className={URGENCY_CLASS[urgencyLevel] ?? ""}>
              {urgencyLabel}
            </Badge>
          )}
        </div>

        {matchReason && (
          <p className="text-sm text-muted-foreground">{matchReason}</p>
        )}

        <div className="flex flex-wrap gap-1">
          {sectors.slice(0, 3).map((s, i) => (
            <Badge key={`sector-${i}-${s}`} variant="outline" className="text-xs">
              {s}
            </Badge>
          ))}
          {regions.slice(0, 2).map((r, i) => (
            <Badge key={`region-${i}-${r}`} variant="outline" className="gap-1 text-xs">
              <MapPin className="h-2.5 w-2.5" />
              {r}
            </Badge>
          ))}
        </div>

        {applicantTypes && applicantTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {applicantTypes.slice(0, 3).map((t, i) => (
              <Badge key={`applicant-${i}-${t}`} variant="secondary" className="gap-1 text-xs">
                <Users className="h-2.5 w-2.5" />
                {t}
              </Badge>
            ))}
          </div>
        )}

        <Link href={`/grants/${id}`}>
          <Button variant="outline" size="sm" className="mt-2 w-full gap-2">
            View Details <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
