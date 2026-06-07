"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const categories = [
  { value: "feature_request", label: "Feature request" },
  { value: "product_feedback", label: "Product feedback" },
  { value: "bug_report", label: "Bug report" },
  { value: "other", label: "Other" },
] as const;

type FeedbackCategory = (typeof categories)[number]["value"];

export function ContactFeedbackForm({ defaultEmail }: { defaultEmail?: string | null }) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    category: "feature_request" as FeedbackCategory,
    subject: "",
    message: "",
    contactEmail: defaultEmail ?? "",
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not send feedback");
        return;
      }
      toast.success("Feedback sent. Thank you.");
      setForm((current) => ({
        ...current,
        subject: "",
        message: "",
      }));
    } catch {
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Contact us</CardTitle>
        <CardDescription>
          Suggest the next feature, report friction, or tell us what would make GrantsCopilot more useful.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="feedback-category">Type</Label>
              <select
                id="feedback-category"
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as FeedbackCategory }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedback-email">Contact email</Label>
              <Input
                id="feedback-email"
                type="email"
                value={form.contactEmail}
                onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))}
                placeholder="you@company.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-subject">Subject</Label>
            <Input
              id="feedback-subject"
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              placeholder="What should we improve or build next?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-message">Feedback</Label>
            <Textarea
              id="feedback-message"
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              placeholder="Share the workflow, feature, bug, or outcome you want us to understand."
              rows={7}
              required
            />
          </div>

          <Button type="submit" disabled={submitting} className="gap-2">
            <Send className="h-4 w-4" />
            {submitting ? "Sending..." : "Send feedback"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
