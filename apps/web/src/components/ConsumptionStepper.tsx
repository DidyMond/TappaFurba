import { canStepConsumption, formatConsumption, formatConsumptionWithUnit, stepConsumption, unitLabel, type ConsumptionUnit } from "../lib/consumption";
import { MinusIcon, PlusIcon, SpeedIcon } from "./icons";

interface ConsumptionStepperProps {
  /** Consumo di questa ricerca, km/L (il modello interno: l'unità cambia solo come lo si vede). */
  value: number;
  /** Consumo del profilo (Impostazioni), km/L: «ripristina profilo» ci torna. */
  profile: number;
  unit: ConsumptionUnit;
  onChange: (kmPerLiter: number) => void;
}

const stepButton =
  "w-7 h-7 rounded-full bg-surface-container-low border border-outline-variant/40 text-primary flex items-center justify-center active:scale-95 hover:border-primary transition-colors disabled:opacity-40 disabled:hover:border-outline-variant/40";

/**
 * Consumo per-ricerca: − / pill del valore / + a passi di 0,5 (km/L o L/100 km, secondo l'unità scelta nelle
 * Impostazioni) e il link «ripristina profilo». L'etichetta dell'unità sta sempre accanto al valore.
 */
export function ConsumptionStepper({ value, profile, unit, onChange }: ConsumptionStepperProps) {
  const changed = value !== profile;
  return (
    <div role="group" aria-label="Consumo del veicolo" className="flex flex-col gap-space-sm rounded-2xl bg-surface-container-lowest border border-outline-variant/40 p-space-md">
      <div className="flex items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md min-w-0">
          <span className="w-8 h-8 rounded-full bg-primary/10 text-on-primary-fixed-variant flex items-center justify-center shrink-0">
            <SpeedIcon className="w-[18px] h-[18px]" />
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-label-md font-label-md font-semibold text-on-surface truncate">Consumo medio</span>
            <span className={`text-body-sm font-body-sm truncate ${changed ? "text-on-primary-fixed-variant font-medium" : "text-on-surface-variant"}`}>
              {changed ? "Personalizzato" : "dal tuo profilo"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-space-sm shrink-0">
          <button type="button" aria-label="Riduci consumo" className={stepButton} disabled={!canStepConsumption(value, unit, -1)} onClick={() => onChange(stepConsumption(value, unit, -1))}>
            <MinusIcon className="w-3.5 h-3.5" />
          </button>
          <output data-testid="consumption-value" className="min-w-[5.5rem] text-center inline-flex items-baseline justify-center gap-1 rounded-full bg-primary/10 text-on-primary-fixed-variant px-space-md py-space-xs tabular-nums">
            <span className="text-label-lg font-label-lg font-bold">{formatConsumption(value, unit)}</span>
            {" "}
            <span className="text-label-sm font-label-sm">{unitLabel(unit)}</span>
          </output>
          <button type="button" aria-label="Aumenta consumo" className={stepButton} disabled={!canStepConsumption(value, unit, 1)} onClick={() => onChange(stepConsumption(value, unit, 1))}>
            <PlusIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <button
        type="button"
        disabled={!changed}
        onClick={() => onChange(profile)}
        className="self-end text-label-md font-label-md underline underline-offset-2 text-on-primary-fixed-variant disabled:no-underline disabled:text-on-surface-variant disabled:opacity-60 disabled:cursor-default"
      >
        ripristina profilo ({formatConsumptionWithUnit(profile, unit)})
      </button>
    </div>
  );
}
