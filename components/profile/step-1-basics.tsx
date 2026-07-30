"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BUSINESS_SIZE_BANDS,
  BUSINESS_STAGES,
  BUSINESS_TYPES,
  FOUNDER_EMPLOYMENT_STATUSES,
  LEGAL_STRUCTURES,
  step1Schema,
  type Step1Data,
} from "@/lib/validations/profile";
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

const EXTRA_BASICS_FIELDS: { name: keyof Step1Data; label: string; placeholder: string; type?: string }[] = [
  { name: "tradingName", label: "Trading name", placeholder: "Optional trading name" },
  { name: "charityNumber", label: "Charity number", placeholder: "If applicable" },
  { name: "vatNumber", label: "VAT number", placeholder: "GB123456789" },
  { name: "yearEstablished", label: "Year established", placeholder: "2021", type: "number" },
  { name: "incorporationDate", label: "Incorporation date", placeholder: "2024-03-01", type: "date" },
  { name: "tradingStartDate", label: "Trading start date", placeholder: "2024-04-01", type: "date" },
  { name: "employeeCount", label: "Employee count", placeholder: "4", type: "number" },
  { name: "expectedEmployeeGrowth", label: "Expected employee growth", placeholder: "e.g. Hire 3 staff in the next 12 months" },
  { name: "registeredAddress", label: "Registered address", placeholder: "Registered office address" },
  { name: "operatingAddress", label: "Operating address", placeholder: "If different from registered address" },
  { name: "postcode", label: "Postcode / ZIP", placeholder: "SW1A 1AA" },
  { name: "country", label: "Country", placeholder: "United Kingdom" },
  { name: "region", label: "Region", placeholder: "England, Scotland, Wales, Northern Ireland..." },
  { name: "localAuthority", label: "Local authority", placeholder: "Bristol City Council, South Gloucestershire..." },
  { name: "areasServed", label: "Areas served", placeholder: "UK, South West, EU, Switzerland..." },
  { name: "primaryContactName", label: "Primary contact name", placeholder: "Jane Smith" },
  { name: "primaryContactRole", label: "Primary contact role", placeholder: "Managing Director" },
  { name: "primaryContactEmail", label: "Primary contact email", placeholder: "jane@example.com", type: "email" },
  { name: "primaryContactPhone", label: "Primary contact phone", placeholder: "+44 7123 456789", type: "tel" },
  { name: "primaryContactLinkedIn", label: "Primary contact LinkedIn", placeholder: "https://www.linkedin.com/in/...", type: "url" },
  { name: "preferredContactMethod", label: "Preferred contact method", placeholder: "Email, phone, WhatsApp..." },
];

interface Step1Props {
  defaultValues: Partial<z.input<typeof step1Schema>>;
  onSubmit: (data: Step1Data) => Promise<void>;
  isPending: boolean;
}

function SelectField({
  control,
  name,
  label,
  placeholder,
  options,
  help,
}: {
  control: ReturnType<typeof useForm<z.input<typeof step1Schema>, unknown, Step1Data>>["control"];
  name: keyof Step1Data;
  label: string;
  placeholder: string;
  options: readonly string[];
  help?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={typeof field.value === "string" ? field.value : ""}
              onChange={field.onChange}
              aria-label={label}
            >
              <option value="">{placeholder}</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </FormControl>
          {help && <p className="text-muted-foreground text-xs">{help}</p>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function Step1Basics({ defaultValues, onSubmit, isPending }: Step1Props) {
  const form = useForm<z.input<typeof step1Schema>, unknown, Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      businessName: defaultValues.businessName ?? "",
      tradingName: defaultValues.tradingName ?? "",
      businessType: defaultValues.businessType ?? "",
      legalStructure: defaultValues.legalStructure ?? "",
      businessStage: defaultValues.businessStage ?? "",
      businessSizeBand: defaultValues.businessSizeBand ?? "",
      founderEmploymentStatus: defaultValues.founderEmploymentStatus ?? "",
      registrationNumber: defaultValues.registrationNumber ?? "",
      charityNumber: defaultValues.charityNumber ?? "",
      vatNumber: defaultValues.vatNumber ?? "",
      yearEstablished: defaultValues.yearEstablished ?? "",
      incorporationDate: defaultValues.incorporationDate ?? "",
      tradingStartDate: defaultValues.tradingStartDate ?? "",
      employeeCount: defaultValues.employeeCount ?? "",
      expectedEmployeeGrowth: defaultValues.expectedEmployeeGrowth ?? "",
      location: defaultValues.location ?? "",
      registeredAddress: defaultValues.registeredAddress ?? "",
      operatingAddress: defaultValues.operatingAddress ?? "",
      postcode: defaultValues.postcode ?? "",
      country: defaultValues.country ?? "",
      region: defaultValues.region ?? "",
      localAuthority: defaultValues.localAuthority ?? "",
      areasServed: defaultValues.areasServed ?? "",
      primaryContactName: defaultValues.primaryContactName ?? "",
      primaryContactRole: defaultValues.primaryContactRole ?? "",
      primaryContactEmail: defaultValues.primaryContactEmail ?? "",
      primaryContactPhone: defaultValues.primaryContactPhone ?? "",
      primaryContactLinkedIn: defaultValues.primaryContactLinkedIn ?? "",
      preferredContactMethod: defaultValues.preferredContactMethod ?? "",
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

        <div className="grid gap-4 sm:grid-cols-2">
          {EXTRA_BASICS_FIELDS.slice(0, 8).map((item) => (
            <FormField
              key={item.name}
              control={form.control}
              name={item.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{item.label}</FormLabel>
                  <FormControl>
                    <Input
                      type={item.type ?? "text"}
                      placeholder={item.placeholder}
                      value={typeof field.value === "string" || typeof field.value === "number" ? field.value : ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="businessType"
            label="Applicant category"
            placeholder="— Select applicant category —"
            options={BUSINESS_TYPES}
            help="Used for legacy grant applicant matching."
          />
          <SelectField
            control={form.control}
            name="legalStructure"
            label="Legal structure"
            placeholder="— Select legal structure —"
            options={LEGAL_STRUCTURES}
            help="Helps block grants restricted to charities, sole traders, limited companies, or public bodies."
          />
          <SelectField
            control={form.control}
            name="businessStage"
            label="Business stage"
            placeholder="— Select business stage —"
            options={BUSINESS_STAGES}
            help="Helps separate startup, established SME, growth, and enterprise opportunities."
          />
          <SelectField
            control={form.control}
            name="businessSizeBand"
            label="Business size band"
            placeholder="— Select size band —"
            options={BUSINESS_SIZE_BANDS}
            help="Micro, small, and medium businesses still match generic SME grants unless a funder is stricter."
          />
          <SelectField
            control={form.control}
            name="founderEmploymentStatus"
            label="Founder / employment status"
            placeholder="— Select status —"
            options={FOUNDER_EMPLOYMENT_STATUSES}
            help="Useful for founder, self-employed, and individual applicant rules."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {EXTRA_BASICS_FIELDS.slice(8).map((item) => (
            <FormField
              key={item.name}
              control={form.control}
              name={item.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{item.label}</FormLabel>
                  <FormControl>
                    <Input
                      type={item.type ?? "text"}
                      placeholder={item.placeholder}
                      value={typeof field.value === "string" || typeof field.value === "number" ? field.value : ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

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
                Our AI will analyse your website to better understand your business for grant matching and preparation.
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
            Save &amp; Next
          </Button>
        </div>
      </form>
    </Form>
  );
}
