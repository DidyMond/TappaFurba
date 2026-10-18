import { useEffect, useId, useRef, useState } from "react";
import { parseDecimal } from "../../lib/settings";

interface NumberFieldProps {
  label: string;
  /** Valore salvato nella bozza; null = campo vuoto (solo con `optional`). */
  value: number | null;
  min: number;
  max: number;
  unit: string;
  /** Con `optional` il campo può restare vuoto (valore null). */
  optional?: boolean;
  /** Solo numeri interi (es. ore). */
  integer?: boolean;
  /** Testo d'aiuto sotto il campo. */
  hint?: string;
  /** Chiamata solo con valori validi (o null se vuoto e opzionale). */
  onChange: (value: number | null) => void;
  /** Dice al contenitore se il testo digitato è valido (per bloccare il salvataggio). */
  onValidityChange?: (valid: boolean) => void;
  placeholder?: string;
  /** Al montaggio porta il cursore sul campo e lo mostra (es. arrivando dall'avviso «stazioni non mostrate»). */
  focusOnMount?: boolean;
}

const toText = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));

/**
 * Campo numerico con virgola o punto decimale e validazione a intervallo. Mostra l'errore finché il testo non è
 * valido e non propaga mai valori fuori intervallo: la bozza resta sempre coerente.
 */
export function NumberField({ label, value, min, max, unit, optional, integer, hint, onChange, onValidityChange, placeholder, focusOnMount }: NumberFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusOnMount) return;
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView?.({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montaggio.
  }, []);
  const [text, setText] = useState(() => toText(value));

  const evaluate = (candidate: string): { valid: boolean; value: number | null } => {
    if (candidate.trim() === "") return { valid: Boolean(optional), value: null };
    const parsed = parseDecimal(candidate);
    if (parsed === null || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) return { valid: false, value: null };
    return { valid: true, value: parsed };
  };

  const current = evaluate(text);

  // Il valore cambia da fuori (ripristino, pre-compilazione): si riallinea il testo se non coincide già.
  useEffect(() => {
    const parsed = text.trim() === "" ? null : parseDecimal(text);
    if (parsed !== value) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si reagisce solo al valore esterno.
  }, [value]);

  useEffect(() => {
    onValidityChange?.(current.valid);
    // Smontato (es. campi manuali nascosti): non deve bloccare il salvataggio.
    return () => onValidityChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notifica solo quando cambia la validità.
  }, [current.valid]);

  const error = !current.valid
    ? integer
      ? `Inserisci un numero intero tra ${min} e ${max}.`
      : `Inserisci un valore tra ${String(min).replace(".", ",")} e ${String(max).replace(".", ",")} ${unit}.`
    : null;

  return (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-center justify-between gap-space-md">
        <label htmlFor={id} className="text-label-sm font-label-sm font-semibold text-on-surface">
          {label}
        </label>
        <div className="flex items-center gap-space-sm">
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode={integer ? "numeric" : "decimal"}
            value={text}
            placeholder={placeholder}
            aria-invalid={!current.valid}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            onChange={(event) => {
              const next = event.target.value;
              setText(next);
              const result = evaluate(next);
              if (result.valid) onChange(result.value);
            }}
            className={`w-20 h-9 rounded bg-surface-container-low text-center field-text font-label-lg font-semibold tabular-nums text-on-surface outline-none focus:ring-2 focus:ring-primary/40 ${
              current.valid ? "" : "ring-2 ring-error/60"
            }`}
          />
          <span className="text-body-sm font-body-sm text-on-surface-variant w-10">{unit}</span>
        </div>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-body-sm font-body-sm text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-body-sm font-body-sm text-on-surface-variant">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
