"use client";

import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";
import { Input } from "@/components/ui/input";

const AMOUNTS = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 5000000];
const formatAmount = (amount: number) => new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "GBP", maximumFractionDigits: 0,
}).format(amount);

type FundingAmountSelectProps = Omit<ComponentPropsWithoutRef<"select">, "value" | "onChange" | "onBlur"> & {
  value?: number | string;
  onChange: (value: number | string) => void;
  bound: "minimum" | "maximum";
  onBlur?: () => void;
};

/** Preserve exact saved/AI amounts; presets are shortcuts, never rounded values. */
export const FundingAmountSelect = forwardRef<HTMLSelectElement, FundingAmountSelectProps>(
  function FundingAmountSelect({ value, onChange, bound, ...props }, ref) {
    const [custom, setCustom] = useState(false);
    const hasValue = value !== undefined && value !== null && value !== "";
    const isPreset = hasValue && AMOUNTS.includes(Number(value));
    const showCustom = custom || (hasValue && !isPreset);
    return <div className="min-w-0 space-y-2">
      <select {...props} ref={ref} value={showCustom ? "custom" : hasValue ? String(value) : ""}
        className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
        onChange={(event) => {
          const next = event.target.value;
          setCustom(next === "custom");
          if (next !== "custom") onChange(next === "" ? "" : Number(next));
        }}>
        <option value="">Select {bound} amount</option>
        {AMOUNTS.map((amount) => <option key={amount} value={amount}>{formatAmount(amount)}</option>)}
        <option value="custom">Custom amount…</option>
      </select>
      {showCustom && <Input type="number" inputMode="decimal" min={1} step="any"
        name={`${props.name ?? bound}-custom`} aria-label={`Custom ${bound} amount (GBP)`}
        aria-describedby={props["aria-describedby"]} aria-invalid={props["aria-invalid"]}
        disabled={props.disabled} value={value ?? ""} onBlur={props.onBlur}
        onChange={(event) => onChange(event.target.value)} placeholder="Enter your exact amount" />}
    </div>;
  },
);
