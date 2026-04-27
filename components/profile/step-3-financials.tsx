"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { step3Schema, type Step3Data } from "@/lib/validations/profile";
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
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Step3Props {
  defaultValues: Partial<Step3Data>;
  onSubmit: (data: Step3Data) => Promise<void>;
  onBack: () => void;
  isPending: boolean;
}

export function Step3Financials({
  defaultValues,
  onSubmit,
  onBack,
  isPending,
}: Step3Props) {
  const form = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      employeeCount: defaultValues.employeeCount ?? undefined,
      contractorCount: defaultValues.contractorCount ?? "",
      annualRevenue: defaultValues.annualRevenue ?? undefined,
      profitLoss: defaultValues.profitLoss ?? "",
      cashReserves: defaultValues.cashReserves ?? "",
      financialProjections: defaultValues.financialProjections ?? "",
      previousGrants: defaultValues.previousGrants ?? "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="employeeCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number of Employees</FormLabel>
              <FormControl>
                <Input type="number" placeholder="10" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contractorCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number of Contractors (optional)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="3" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="annualRevenue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Annual Revenue (GBP)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="500000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="profitLoss"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profit / Loss Summary (optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Summarise recent profit/loss figures or explain pre-revenue status..." rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cashReserves"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cash Reserves / Runway (optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="e.g. £85k cash reserves, 9 months runway..." rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="financialProjections"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Financial Projections (optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Projected revenue, costs, growth assumptions, break-even timeline..." rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="previousGrants"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Previous Grants Received (optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="List any grants you've previously received..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save &amp; Next
          </Button>
        </div>
      </form>
    </Form>
  );
}
