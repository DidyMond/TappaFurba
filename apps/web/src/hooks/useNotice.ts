import { useCallback, useEffect, useRef, useState } from "react";

/** Avviso passeggero («Stazione salvata», «Preferenze salvate»…): sparisce da solo e viene letto dai lettori di schermo. */
export function useNotice(durationMs = 2500): [string | null, (message: string) => void] {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback(
    (message: string) => {
      setNotice(message);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setNotice(null), durationMs);
    },
    [durationMs],
  );
  return [notice, show];
}
