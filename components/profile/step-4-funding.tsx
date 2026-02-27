"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  step4Schema,
  type Step4Data,
  FUNDING_PURPOSES,
} from "@/lib/validations/profile";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Step4Props {
  defaultValues: Partial<Step4Data>;
  onSubmit: (data: Step4Data) => Promise<void>;
  onBack: () => void;
  isPending: boolean;
}

export function Step4Funding({
  defaultValues,
  onSubmit,
  onBack,
  isPending,
}: Step4Props) {
  const form = useForm<Step4Data>({
    resolver: zodResolver(step4Schema),
    defaultValues: {
      fundingMin: defaultValues.fundingMin ?? undefined,
      fundingMax: defaultValues.fundingMax ?? undefined,
      fundingPurposes: defaultValues.fundingPurposes ?? [],
      fundingDetails: defaultValues.fundingDetails ?? "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <FormLabel>Funding Range (GBP)</FormLabel>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="fundingMin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-muted-foreground">
                    Minimum
                  </FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="10000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fundingMax"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-muted-foreground">
                    Maximum
                  </FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="500000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="fundingPurposes"
          render={() => (
            <FormItem>
              <FormLabel>How will you use the funding?</FormLabel>
              <p className="text-sm text-muted-foreground">
                Select all that apply
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                {FUNDING_PURPOSES.map((purpose) => (
                  <FormField
                    key={purpose}
                    control={form.control}
                    name="fundingPurposes"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(purpose)}
                            onCheckedChange={(checked) => {
                              const current = field.value ?? [];
                              field.onChange(
                                checked
                                  ? [...current, purpose]
                                  : current.filter((v: string) => v !== purpose)
                              );
                            }}
                          />
                        </FormControl>
                        <FormLabel className="text-sm font-normal cursor-pointer">
                          {purpose}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fundingDetails"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Additional Details{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any extra context — key activities, milestones, expected outcomes..."
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save &amp; Continue
          </Button>
        </div>
      </form>
    </Form>
  );
}
