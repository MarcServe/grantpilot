"use client";

import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  ELIGIBILITY_FACT_CATEGORIES,
  type EligibilityFact,
} from "@/lib/eligibility-facts";
import { step7Schema, type Step7Data } from "@/lib/validations/profile";

const PRESETS: Array<{ label: string; category: EligibilityFact["category"]; value: string }> = [
  { label: "Owns business premises", category: "Property / premises", value: "Yes - confirmed by the business" },
  { label: "Leases business premises", category: "Property / premises", value: "Yes - confirmed by the business" },
  { label: "Match funding available", category: "Match funding", value: "Yes - amount and source to be confirmed" },
  { label: "Trading history evidence", category: "Trading history", value: "Available if required by the funder" },
  { label: "Relevant certification", category: "Certification / compliance", value: "Certification or compliance evidence available" },
  { label: "Delivery partner confirmed", category: "Partnerships", value: "Partner or collaborator available for the project" },
];

function newFact(overrides?: Partial<EligibilityFact>): EligibilityFact {
  return {
    id: crypto.randomUUID(),
    label: "",
    value: "",
    category: "Other",
    evidence: "",
    source: "manual",
    confidence: "confirmed",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function Step7EligibilityFacts({
  defaultValues,
  onSubmit,
  onBack,
  onComplete,
  isPending,
}: {
  defaultValues: Step7Data;
  onSubmit: (data: Step7Data) => Promise<boolean>;
  onBack: () => void;
  onComplete: () => void;
  isPending?: boolean;
}) {
  const form = useForm<Step7Data>({
    resolver: zodResolver(step7Schema) as Resolver<Step7Data>,
    defaultValues: {
      eligibilityFacts: defaultValues.eligibilityFacts ?? [],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "eligibilityFacts",
  });

  async function handleSave(data: Step7Data) {
    await onSubmit(data);
  }

  async function handleSaveAndComplete(data: Step7Data) {
    const saved = await onSubmit(data);
    if (saved) onComplete();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSaveAndComplete)} className="space-y-5">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          <strong>Eligibility facts reduce repeated gaps.</strong> Use this for confirmed
          edge-case requirements that do not fit the normal tabs, such as property ownership,
          lease status, match funding, certifications, trading history, regulated status,
          or partner commitments. AI can suggest facts, but you should confirm them manually
          before GrantsCopilot treats them as true.
        </div>

        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Custom eligibility facts</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                These facts are included in grant scoring, Founder Pack answers, and Business DNA memory.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => append(newFact())}>
              <Plus className="h-4 w-4" />
              Add custom fact
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => append(newFact(preset))}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {fields.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No custom facts added yet. Add one when a funder asks for something specific,
              for example “must own property” or “must provide 20% match funding”.
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-md border bg-background p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name={`eligibilityFacts.${index}.label`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fact label</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g. Owns business premises" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`eligibilityFacts.${index}.category`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              value={field.value ?? "Other"}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                            >
                              {ELIGIBILITY_FACT_CATEGORIES.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`eligibilityFacts.${index}.value`}
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Confirmed fact</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              rows={2}
                              className="resize-y"
                              placeholder="e.g. The company owns its trading premises in Bristol."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`eligibilityFacts.${index}.evidence`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Evidence or note</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value ?? ""} placeholder="e.g. Land registry, lease, bank statement, certificate" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`eligibilityFacts.${index}.confidence`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              value={field.value ?? "confirmed"}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                            >
                              <option value="confirmed">Confirmed</option>
                              <option value="needs_evidence">Needs evidence</option>
                              <option value="suggested">AI suggested - confirm manually</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={isPending} onClick={form.handleSubmit(handleSave)}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Page
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete Profile
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
