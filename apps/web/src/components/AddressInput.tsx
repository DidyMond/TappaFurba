import type { LonLat } from "@tappafurba/shared";
import { useId, useRef, useState, type ReactNode } from "react";
import { AUTOCOMPLETE_MIN_CHARS, useAddressAutocomplete } from "../hooks/useAddressAutocomplete";
import { isOffline, OFFLINE_SUGGESTIONS_MESSAGE } from "../lib/connectivity";
import { focusCameFromKeyboard } from "../lib/focusModality";
import { CloseIcon, SpinnerIcon } from "./icons";

export interface Place {
  lon: number;
  lat: number;
  label: string;
}

interface AddressInputProps {
  /** Nome accessibile del campo («Partenza», «Destinazione»). */
  label: string;
  /** Didascalia visibile sopra il testo», «A (Destinazione)»). */
  caption: string;
  placeholder: string;
  /** `data-testid` del campo di testo (test end-to-end). */
  testId?: string;
  text: string;
  onTextChange: (text: string) => void;
  /** Luogo scelto dall'elenco (null finché l'utente non ne seleziona uno). */
  place: Place | null;
  onPlaceSelect: (place: Place) => void;
  /** Bias di prossimità per i suggerimenti (es. posizione dell'utente). */
  proximity?: LonLat;
  /** Il pallino a sinistra (origine/destinazione): la linea tratteggiata della card lo attraversa. */
  leading: ReactNode;
  /** Azione a destra del campo, dopo la «×» (es. «Usa la posizione attuale»). */
  trailing?: ReactNode;
  /**
   * false = non cercare suggerimenti: il testo non l'ha scritto l'utente (arriva da un tragitto salvato, che si risolve
   * con una richiesta apposta). Torna attivo appena l'utente modifica il testo.
   */
  suggestions?: boolean;
}

const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * «via esempio 12, città di prova»: la parte dopo la virgola (il comune) non compare in nessun suggerimento. Mapbox ha
 * cercato «via esempio» in tutta Italia perché la via si chiama «Via Giuseppe Esempio»: lo si dice all'utente.
 */
export function placeMissingFromSuggestions(text: string, labels: string[]): boolean {
  const parts = text.split(",");
  if (parts.length < 2) return false;
  const place = plain(parts[parts.length - 1]!).trim();
  return place.length >= 3 && !labels.some((label) => plain(label).includes(place));
}

/** La seconda riga di un suggerimento senza ripetere il nome già in grassetto: «21040 Origgio provincia di Varese, Italia». */
export function addressDetail(name: string, label: string): string {
  return label.startsWith(`${name}, `) ? label.slice(name.length + 2) : label;
}

export const FULL_STREET_HINT = "Non trovi l'indirizzo? Scrivi il nome completo della via (es. «Via Roma 10, Milano»).";

/**
 * Riga indirizzo della card A→B: pallino, didascalia piccola sopra il testo, «×» per cancellare e un'azione
 * facoltativa a destra. Altezza fissa (72 px): la linea tratteggiata della card cade esattamente tra i due pallini.
 * Focus: da mouse/tap nessuno sfondo e nessun anello (`focus:outline-none focus:ring-0`); da tastiera
 * solo un anello `ring-2 ring-secondary/60` sul contenitore del testo, mai sulla colonna dei pallini dove passa la linea
 * tratteggiata. I controlli a destra hanno un'area di tocco di 44 px ciascuno.
 */
export function AddressInput({
  label,
  caption,
  placeholder,
  testId,
  text,
  onTextChange,
  place,
  onPlaceSelect,
  proximity,
  leading,
  trailing,
  suggestions: suggestionsEnabled = true,
}: AddressInputProps) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  // Anello di focus: solo se il campo ha preso il focus da tastiera (vedi lib/focusModality).
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { suggestions, loading, error, settled } = useAddressAutocomplete(text, focused && place === null && suggestionsEnabled, proximity);
  const searching = focused && place === null && suggestionsEnabled && text.trim().length >= AUTOCOMPLETE_MIN_CHARS;
  const empty = searching && settled && !error && suggestions.length === 0;
  const open = searching && (suggestions.length > 0 || error || empty);
  const hint = searching && settled && !error && placeMissingFromSuggestions(text, suggestions.map((s) => s.label));

  const select = (index: number) => {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    onPlaceSelect({ lon: suggestion.lon, lat: suggestion.lat, label: suggestion.label });
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      select(activeIndex);
    } else if (event.key === "Escape") {
      setFocused(false);
    }
  };

  return (
    <div data-testid="address-row" className="relative flex items-center gap-space-md h-[72px] px-1">
      <span className="relative z-10 w-3 flex justify-center shrink-0">{leading}</span>

      <div
        data-testid="address-field"
        data-keyboard-focus={keyboardFocus ? "true" : "false"}
        className={`flex-1 min-w-0 rounded px-space-md py-space-sm transition-shadow ${keyboardFocus ? "ring-2 ring-secondary/60" : ""}`}
      >
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <span aria-hidden="true" className="block text-label-sm font-label-sm font-medium text-on-surface-variant leading-none mb-0.5">
          {caption}
        </span>
        <input
          ref={inputRef}
          id={id}
          data-testid={testId}
          type="text"
          role="combobox"
          aria-expanded={Boolean(open)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setActiveIndex(-1);
            onTextChange(event.target.value);
          }}
          onFocus={() => {
            setFocused(true);
            setKeyboardFocus(focusCameFromKeyboard());
          }}
          onBlur={() => {
            setFocused(false);
            setKeyboardFocus(false);
          }}
          onKeyDown={onKeyDown}
          className="block w-full truncate bg-transparent field-text leading-5 font-body-md font-semibold text-on-surface placeholder:font-normal placeholder:text-on-surface-variant outline-none"
        />

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={`Suggerimenti per ${label}`}
            className="absolute left-0 right-0 top-full mt-space-xs z-30 max-h-72 overflow-y-auto rounded bg-surface-container-lowest border border-outline-variant/40 shadow-lg py-space-xs"
          >
            {hint && (
              <li role="presentation" data-testid="full-street-hint" className="px-space-lg py-space-sm text-body-sm font-body-sm text-on-surface-variant bg-surface-container-low border-b border-outline-variant/30">
                {FULL_STREET_HINT}
              </li>
            )}
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`${id}-option-${index}`}
                data-testid="address-suggestion"
                role="option"
                aria-selected={index === activeIndex}
                // mousedown (non click) e preventDefault: la selezione avviene prima che l'input perda il focus.
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(index);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`px-space-lg py-space-sm cursor-pointer ${index === activeIndex ? "bg-surface-container-low" : ""}`}
              >
                <div className="text-label-lg font-label-lg text-on-surface truncate">{suggestion.name}</div>
                <div className="text-body-sm font-body-sm text-on-surface-variant line-clamp-2">{addressDetail(suggestion.name, suggestion.label)}</div>
              </li>
            ))}
            {error && suggestions.length === 0 && (
              <li role="presentation" className="px-space-lg py-space-sm text-body-sm font-body-sm text-on-surface-variant">
                {isOffline() ? OFFLINE_SUGGESTIONS_MESSAGE : "Suggerimenti non disponibili al momento. Riprova tra poco."}
              </li>
            )}
            {empty && (
              <li role="presentation" className="px-space-lg py-space-sm text-body-sm font-body-sm text-on-surface-variant">
                Nessun suggerimento per «{text.trim()}». Prova con il nome completo della via e il comune.
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-space-sm shrink-0">
        {loading && <SpinnerIcon className="w-4 h-4 text-on-surface-variant" />}
        {text !== "" && (
          <button
            type="button"
            aria-label={`Cancella ${label.toLowerCase()}`}
            // mousedown + preventDefault: il campo non perde il focus e il tap non chiude i suggerimenti prima del click.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onTextChange("");
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            className="group w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface"
          >
            <span className="w-7 h-7 rounded-full bg-surface-container-low group-active:scale-95 transition flex items-center justify-center">
              <CloseIcon className="w-3.5 h-3.5" />
            </span>
          </button>
        )}
        {trailing}
      </div>
    </div>
  );
}
