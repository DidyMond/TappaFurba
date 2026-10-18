import { useId } from "react";

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** `data-testid` dell'interruttore (test end-to-end). */
  testId?: string;
}

/** Riga con interruttore (role=switch): titolo, spiegazione facoltativa e il comando a destra. Il nome accessibile è il titolo. */
export function ToggleRow({ label, description, checked, onChange, disabled, testId }: ToggleRowProps) {
  const labelId = useId();
  return (
    <div className="flex items-center justify-between gap-space-md">
      <div>
        <span id={labelId} className="text-label-sm font-label-sm font-semibold text-on-surface">
          {label}
        </span>
        {description && <p className="text-body-sm font-body-sm text-on-surface-variant">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        data-testid={testId}
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-7 rounded-full shrink-0 transition-colors disabled:opacity-50 ${checked ? "bg-primary" : "bg-surface-container-high"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-surface-container-lowest shadow-sm transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </div>
  );
}
