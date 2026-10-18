import { render, renderHook, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INSTALL_BANNER_SESSION_KEY,
  isIos,
  resetInstallPromptCapture,
  useIosInstallHint,
  type BeforeInstallPromptEvent,
} from "../hooks/useInstallPrompt";
import { InstallBanner } from "./InstallBanner";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

function device(userAgent: string, extra: { platform?: string; touchPoints?: number } = {}) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.spyOn(navigator, "platform", "get").mockReturnValue(extra.platform ?? "");
  // jsdom non definisce maxTouchPoints: si aggiunge come proprietà propria e la si toglie in afterEach.
  Object.defineProperty(navigator, "maxTouchPoints", { value: extra.touchPoints ?? 0, configurable: true });
}

beforeEach(() => {
  sessionStorage.clear();
  resetInstallPromptCapture();
});
afterEach(() => {
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("isIos", () => {
  it("riconosce iPhone, iPod e iPad", () => {
    device(IPHONE_SAFARI);
    expect(isIos()).toBe(true);
    device("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1");
    expect(isIos()).toBe(true);
  });

  it("riconosce iPadOS in modalità «sito desktop» (si presenta come Mac ma ha il touch)", () => {
    device(MAC_SAFARI, { platform: "MacIntel", touchPoints: 5 });
    expect(isIos()).toBe(true);
  });

  it("non scambia per iOS un Mac vero (senza touch), Android o altri sistemi", () => {
    device(MAC_SAFARI, { platform: "MacIntel", touchPoints: 0 });
    expect(isIos()).toBe(false);
    device(ANDROID_CHROME, { platform: "Linux armv81", touchPoints: 5 });
    expect(isIos()).toBe(false);
    device("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36", { platform: "Win32" });
    expect(isIos()).toBe(false);
  });
});

describe("useIosInstallHint", () => {
  it("su iPhone (Safari) la guida compare", () => {
    device(IPHONE_SAFARI);
    const { result } = renderHook(() => useIosInstallHint());
    expect(result.current.show).toBe(true);
  });

  it("su Android, Mac e Windows non compare", () => {
    device(ANDROID_CHROME, { platform: "Linux armv81", touchPoints: 5 });
    expect(renderHook(() => useIosInstallHint()).result.current.show).toBe(false);
    device(MAC_SAFARI, { platform: "MacIntel" });
    expect(renderHook(() => useIosInstallHint()).result.current.show).toBe(false);
  });

  it("già installata (navigator.standalone, o display-mode: standalone): non compare", () => {
    device(IPHONE_SAFARI);
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    expect(renderHook(() => useIosInstallHint()).result.current.show).toBe(false);
    delete (navigator as { standalone?: boolean }).standalone;

    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(display-mode: standalone)", media: query }));
    expect(renderHook(() => useIosInstallHint()).result.current.show).toBe(false);
  });

  it("«Non ora» la nasconde per la sessione: un nuovo montaggio non la ripropone", () => {
    device(IPHONE_SAFARI);
    const first = renderHook(() => useIosInstallHint());
    act(() => first.result.current.dismiss());
    expect(first.result.current.show).toBe(false);
    expect(sessionStorage.getItem(INSTALL_BANNER_SESSION_KEY)).toBe("1");
    first.unmount();
    expect(renderHook(() => useIosInstallHint()).result.current.show).toBe(false);
  });

  it("con sessionStorage bloccato funziona comunque", () => {
    device(IPHONE_SAFARI);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloccato");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloccato");
    });
    const { result } = renderHook(() => useIosInstallHint());
    expect(result.current.show).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.show).toBe(false);
  });
});

describe("InstallBanner — guida per iOS", () => {
  it("su iPhone mostra la guida: «Installa TappaFurba: tocca Condividi e poi Aggiungi alla schermata Home»", () => {
    device(IPHONE_SAFARI);
    render(<InstallBanner />);
    const hint = screen.getByRole("complementary", { name: "Come installare l'app" });
    expect(hint).toHaveTextContent("Installa TappaFurba:");
    expect(hint).toHaveTextContent("Condividi");
    expect(hint).toHaveTextContent("Aggiungi alla schermata Home");
    // nessun pulsante «Installa»: su iOS non esiste
    expect(screen.queryByRole("button", { name: "Installa TappaFurba" })).not.toBeInTheDocument();
  });

  it("segue DESIGN.md come il banner di installazione e resta una riga nel flusso della pagina", () => {
    device(IPHONE_SAFARI);
    render(<InstallBanner />);
    const hint = screen.getByRole("complementary", { name: "Come installare l'app" });
    expect(hint).toHaveClass("rounded-lg", "shadow-md", "bg-surface-container-lowest");
    expect(hint).not.toHaveClass("fixed");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Non ora» la chiude e non torna nella sessione", async () => {
    const user = userEvent.setup();
    device(IPHONE_SAFARI);
    const first = render(<InstallBanner />);
    await user.click(screen.getByRole("button", { name: "Non ora" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    first.unmount();
    render(<InstallBanner />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("su desktop/Android senza evento di installazione non compare nulla", () => {
    device(ANDROID_CHROME, { platform: "Linux armv81", touchPoints: 5 });
    render(<InstallBanner />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("se il browser offre davvero l'installazione (beforeinstallprompt) vince il pulsante, non la guida", () => {
    device(IPHONE_SAFARI);
    render(<InstallBanner />);
    const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
    Object.assign(event, { prompt: vi.fn().mockResolvedValue(undefined), userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }) });
    act(() => void window.dispatchEvent(event));
    expect(screen.getByRole("button", { name: "Installa TappaFurba" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Come installare l'app" })).not.toBeInTheDocument();
  });
});
