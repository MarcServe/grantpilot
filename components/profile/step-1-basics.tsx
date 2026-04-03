"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { step1Schema, BUSINESS_TYPES, type Step1Data } from "@/lib/validations/profile";
import { FUNDER_LOCATION_LABELS } from "@/lib/constants";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const FUNDER_LOCATION_OPTIONS = (Object.keys(FUNDER_LOCATION_LABELS) as (keyof typeof FUNDER_LOCATION_LABELS)[]).map(
  (value) => ({ value, label: FUNDER_LOCATION_LABELS[value] })
);

interface Step1Props {
  defaultValues: Partial<z.input<typeof step1Schema>>;
  onSubmit: (data: Step1Data) => Promise<void>;
  isPending: boolean;
}

export function Step1Basics({ defaultValues, onSubmit, isPending }: Step1Props) {
  const form = useForm<z.input<typeof step1Schema>, unknown, Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      businessName: defaultValues.businessName ?? "",
      businessType: defaultValues.businessType ?? "",
      registrationNumber: defaultValues.registrationNumber ?? "",
      location: defaultValues.location ?? "",
      funderLocations: defaultValues.funderLocations ?? [],
      websiteUrl: defaultValues.websiteUrl ?? "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="businessName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Business Name</FormLabel>
              <FormControl>
                <Input placeholder="Acme Ltd" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="businessType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Business Type</FormLabel>
              <FormControl>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  aria-label="Business type"
                >
                  <option value="">— Select your business type —</option>
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </FormControl>
              <p className="text-muted-foreground text-xs">
                Used to match you with grants that accept your organisation type.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="registrationNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Registration Number (optional)</FormLabel>
              <FormControl>
                <Input placeholder="12345678" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl>
                <Input placeholder="London, UK" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="websiteUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Website (optional)</FormLabel>
              <FormControl>
                <Input placeholder="https://www.yourcompany.com" type="url" {...field} />
              </FormControl>
              <p className="text-muted-foreground text-xs">
                Our AI will analyse your website to better understand your business when filling grant applications.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="funderLocations"
          render={() => (
            <FormItem>
              <FormLabel>Funder locations</FormLabel>
              <p className="text-muted-foreground text-sm">
                Only show grants from funders in these regions. Leave all unchecked to see all.
              </p>
              <FormControl>
                <div className="flex flex-wrap gap-4 pt-2">
                  {FUNDER_LOCATION_OPTIONS.map(({ value, label }) => (
                    <FormField
                      key={value}
                      control={form.control}
                      name="funderLocations"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(value) ?? false}
                              onCheckedChange={(checked) => {
                                const next = checked
                                  ? [...(field.value ?? []), value]
                                  : (field.value ?? []).filter((v) => v !== value);
                                field.onChange(next);
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">{label}</FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save &amp; Continue
          </Button>
        </div>
      </form>
    </Form>
  );
}
