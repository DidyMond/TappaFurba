import { useEffect, useState, type CSSProperties, type InputHTMLAttributes } from "react";

type RangeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "min" | "max" | "step"> & {
  value: number;
  min: number;
  max: number;
  step?: number;
};

/**
 * Slider nativo (`<input type="range">`: tastiera, ARIA e valore restano quelli del browser) con bersaglio da dito
 * generoso: vedi `.range-touch` in index.css — area di tocco alta 44 px, binario ≥ 6 px, cursore visibile da
 * 28 px (32 px con puntatore grossolano) che a dito premuto cresce di ~1,25 (come l'iOS). Il riempimento del binario
 * (la parte percorsa) è disegnato dalla variabile `--range-ratio`, perché i pseudo-elementi non conoscono il valore.
 */
export function RangeInput({ value, min, max, className = "", style, onPointerDown, onBlur, ...rest }: RangeInputProps) {
  // Dal primo contatto al rilascio (o all'annullamento, es. il browser prende la pagina a scorrere): il cursore è «preso».
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const release = () => setDragging(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [dragging]);
  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  return (
    <input
      {...rest}
      type="range"
      value={value}
      min={min}
      max={max}
      data-dragging={dragging ? "true" : undefined}
      onPointerDown={(event) => {
        setDragging(true);
        onPointerDown?.(event);
      }}
      onBlur={(event) => {
        setDragging(false);
        onBlur?.(event);
      }}
      className={`range-touch ${className}`.trim()}
      style={{ ...style, "--range-ratio": ratio } as CSSProperties}
    />
  );
}
