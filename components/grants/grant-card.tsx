"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Building2, MapPin, ArrowRight } from "lucide-react";

interface GrantCardProps {
  id: string;
  name: string;
  funder: string;
  amount: number | null;
  deadline: string | null;
  sectors: string[];
  regions: string[];
  matchScore?: number;
  matchReason?: string;
}

export function GrantCard({
  id,
  name,
  funder,
  amount,
  deadline,
  sectors,
  regions,
  matchScore,
  matchReason,
}: GrantCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{name}</CardTitle>
            <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              {funder}
            </div>
          </div>
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
        </div>

        {matchReason && (
          <p className="text-sm text-muted-foreground">{matchReason}</p>
        )}

        <div className="flex flex-wrap gap-1">
          {sectors.slice(0, 3).map((s) => (
            <Badge key={s} variant="outline" className="text-xs">
              {s}
            </Badge>
          ))}
          {regions.slice(0, 2).map((r) => (
            <Badge key={r} variant="outline" className="gap-1 text-xs">
              <MapPin className="h-2.5 w-2.5" />
              {r}
            </Badge>
          ))}
        </div>

        <Link href={`/grants/${id}`}>
          <Button variant="outline" size="sm" className="mt-2 w-full gap-2">
            View Details <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
