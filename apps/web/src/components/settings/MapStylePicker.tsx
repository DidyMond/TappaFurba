import { MAP_STYLE_ORDER, MAP_STYLES, type MapStyleId } from "../../lib/mapStyle";
import { CheckIcon } from "../icons";

interface MapStylePickerProps {
  value: MapStyleId;
  onChange: (styleId: MapStyleId) => void;
}

/**
 * Selettore del tema della mappa (Impostazioni → «Tema Mappa»). Quattro card con anteprima 5:3: elenco su mobile,
 * griglia 2×2 da `lg`. Ogni card è una `<label>` con un radio nativo nascosto (`sr-only`): i quattro formano un solo
 * gruppo, quindi Tab entra nel gruppo, le frecce passano da una card all'altra e Spazio seleziona; si aggiunge Enter.
 * Il bordo è sempre da 2 px (verde se scelta, grigio altrimenti) così selezionare non sposta nulla; il segno di spunta
 * dice la stessa cosa del colore. Nessuna transizione sul bordo: il cambio è immediato. L'anello di focus si vede solo con la tastiera (`:focus-visible`).
 */
export function MapStylePicker({ value, onChange }: MapStylePickerProps) {
  return (
    <div className="flex flex-col gap-space-md">
      <p id="map-style-label" className="text-body-sm font-body-sm text-on-surface-variant">
        Scegli lo stile della mappa che preferisci
      </p>
      <div role="radiogroup" aria-labelledby="map-style-label" className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        {MAP_STYLE_ORDER.map((id) => {
          const style = MAP_STYLES[id];
          const selected = value === id;
          return (
            <label
              key={id}
              data-testid={`map-style-${id}`}
              data-selected={selected}
              className={`relative flex flex-col overflow-hidden rounded-lg border-2 bg-surface-container-lowest cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${
                selected ? "border-primary" : "border-outline-variant hover:border-primary/50"
              }`}
            >
              <input
                type="radio"
                name="map-style"
                value={id}
                checked={selected}
                aria-label={`Seleziona stile mappa ${style.name}`}
                onChange={() => onChange(id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onChange(id);
                  }
                }}
                className="sr-only"
              />
              <img
                src={style.preview}
                alt={`Anteprima stile ${style.name}`}
                width={400}
                height={240}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="w-full aspect-[5/3] object-cover bg-surface-container-low"
              />
              {selected && (
                <span
                  data-testid="map-style-check"
                  aria-hidden="true"
                  className="absolute top-space-sm right-space-sm w-7 h-7 rounded-full bg-primary-strong text-on-primary flex items-center justify-center shadow-md"
                >
                  <CheckIcon className="w-4 h-4" />
                </span>
              )}
              <span className="flex flex-col gap-space-xs p-space-lg">
                <span className="text-headline-sm font-headline-sm text-on-surface">{style.name}</span>
                <span className="text-body-sm font-body-sm text-on-surface-variant">{style.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
