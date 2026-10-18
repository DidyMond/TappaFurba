import { useId } from "react";
import { MinusIcon, PlusIcon } from "./icons";

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
  /** Prefisso dei `data-testid` (`-minus`, `-value`, `-plus`) per i test end-to-end. */
  testId?: string;
}

/** Stepper circolare +/− (DESIGN.md — Interactive States: niente ombra, icona `text-primary`). */
export function Stepper({ label, value, min, max, step, unit, onChange, testId }: StepperProps) {
  const labelId = useId();
  const buttonClass =
    "w-8 h-8 rounded-full bg-surface-container-low border border-outline-variant/40 text-primary hover:border-primary transition-colors flex items-center justify-center disabled:opacity-40 disabled:hover:border-outline-variant/40";

  return (
    <div className="flex items-center justify-between gap-space-md">
      <span id={labelId} className="text-label-sm font-label-sm font-semibold text-on-surface">
        {label}
      </span>
      <div className="flex items-center gap-space-md" role="group" aria-labelledby={labelId}>
        <button type="button" data-testid={testId && `${testId}-minus`} className={buttonClass} aria-label={`Diminuisci ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
          <MinusIcon className="w-4 h-4" />
        </button>
        <output data-testid={testId && `${testId}-value`} className="min-w-16 text-center rounded-full bg-primary/10 text-on-primary-fixed-variant px-space-md py-space-xs text-label-lg font-label-lg tabular-nums">
          {value} {unit}
        </output>
        <button type="button" data-testid={testId && `${testId}-plus`} className={buttonClass} aria-label={`Aumenta ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
