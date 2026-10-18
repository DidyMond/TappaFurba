import type { SearchFuelType } from "@tappafurba/shared";
import { FUEL_OPTIONS } from "../lib/defaults";

interface FuelChipsProps {
  value: SearchFuelType;
  onChange: (value: SearchFuelType) => void;
}

/** Selettore carburante: pill da 36 px, attiva `bg-primary-strong text-on-primary` (DESIGN.md — Interactive States). */
export function FuelChips({ value, onChange }: FuelChipsProps) {
  return (
    <div role="radiogroup" aria-label="Carburante" className="flex gap-space-sm overflow-x-auto md:flex-wrap md:overflow-visible">
      {FUEL_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`h-9 px-space-lg rounded-full shrink-0 whitespace-nowrap text-label-lg font-label-lg transition-colors ${
              active ? "bg-primary-strong text-on-primary" : "bg-surface-container-low text-on-surface-variant"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
