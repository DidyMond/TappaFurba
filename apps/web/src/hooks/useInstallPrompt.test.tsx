import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureInstallPrompt,
  INSTALL_BANNER_SESSION_KEY,
  resetInstallPromptCapture,
  useInstallPrompt,
  type BeforeInstallPromptEvent,
} from "./useInstallPrompt";

/** Finto `beforeinstallprompt`: cancellabile, con `prompt()` e l'esito scelto dall'utente. */
function makeEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: "web" }) });
  return { event, prompt };
}

const fire = (event: Event) => act(() => void window.dispatchEvent(event));

beforeEach(() => {
  sessionStorage.clear();
  resetInstallPromptCapture();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useInstallPrompt", () => {
  it("senza l'evento (Safari, già installata…) non propone nulla", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it("cattura beforeinstallprompt, ne blocca la mini-infobar (preventDefault) e abilita il banner", () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event } = makeEvent();
    fire(event);
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.canInstall).toBe(true);
  });

  it("install(): apre la finestra del browser, restituisce l'esito e non si ripropone", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event, prompt } = makeEvent("accepted");
    fire(event);

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.install();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(outcome).toBe("accepted");
    expect(result.current.canInstall).toBe(false); // l'evento è monouso
    expect(sessionStorage.getItem(INSTALL_BANNER_SESSION_KEY)).toBe("1");
  });

  it("anche se l'utente rifiuta la finestra del browser, il banner non torna in questa sessione", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    fire(makeEvent("dismissed").event);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.install();
    });
    expect(outcome).toBe("dismissed");
    expect(result.current.canInstall).toBe(false);
  });

  it("install() senza evento non fa nulla", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    let outcome: unknown = "x";
    await act(async () => {
      outcome = await result.current.install();
    });
    expect(outcome).toBeNull();
  });

  it("«Non ora» (dismiss) nasconde il banner e lo ricorda per la sessione", () => {
    const { result } = renderHook(() => useInstallPrompt());
    fire(makeEvent().event);
    expect(result.current.canInstall).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.canInstall).toBe(false);
    expect(sessionStorage.getItem(INSTALL_BANNER_SESSION_KEY)).toBe("1");
  });

  it("al massimo una proposta per sessione: dopo la chiusura un nuovo montaggio, anche con un nuovo evento, non lo ripropone", () => {
    const first = renderHook(() => useInstallPrompt());
    fire(makeEvent().event);
    act(() => first.result.current.dismiss());
    first.unmount();

    const second = renderHook(() => useInstallPrompt());
    fire(makeEvent().event);
    expect(second.result.current.canInstall).toBe(false);
  });

  it("una nuova sessione (sessionStorage vuoto) lo ripropone", () => {
    const { result } = renderHook(() => useInstallPrompt());
    fire(makeEvent().event);
    expect(result.current.canInstall).toBe(true);
  });

  it("con sessionStorage bloccato funziona comunque (si nasconde per questa visita)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloccato");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloccato");
    });
    const { result } = renderHook(() => useInstallPrompt());
    fire(makeEvent().event);
    expect(result.current.canInstall).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.canInstall).toBe(false);
    vi.restoreAllMocks();
  });

  it("l'evento arrivato prima del montaggio (captureInstallPrompt in main.tsx) non va perso", () => {
    captureInstallPrompt();
    const { event } = makeEvent();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(true);
  });

  it("appinstalled: dopo l'installazione il banner sparisce", () => {
    const { result } = renderHook(() => useInstallPrompt());
    fire(makeEvent().event);
    expect(result.current.canInstall).toBe(true);
    fire(new Event("appinstalled"));
    expect(result.current.canInstall).toBe(false);
  });

  it("già aperta come app (display-mode: standalone): nessun banner", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(display-mode: standalone)", media: query }));
    const { result } = renderHook(() => useInstallPrompt());
    fire(makeEvent().event);
    expect(result.current.canInstall).toBe(false);
  });

  it("iOS «Aggiungi a Home» (navigator.standalone): nessun banner", () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    const { result } = renderHook(() => useInstallPrompt());
    fire(makeEvent().event);
    expect(result.current.canInstall).toBe(false);
    delete (navigator as { standalone?: boolean }).standalone;
  });

  it("toglie i propri listener allo smontaggio", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useInstallPrompt());
    unmount();
    expect(remove).toHaveBeenCalledWith("beforeinstallprompt", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("appinstalled", expect.any(Function));
    remove.mockRestore();
  });
});
