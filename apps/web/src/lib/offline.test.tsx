import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchError } from "../components/SearchError";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { ApiError, autocompleteAddress, searchStations } from "./api";
import { isOffline, OFFLINE_MESSAGE } from "./connectivity";

const setOnline = (online: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
const body = {
  origin: { lon: 9, lat: 45 },
  destination: { lon: 10, lat: 45 },
  fuelType: "benzina",
  liters: 45,
  maxDetourKm: 5,
  consumptionKmPerLiter: 15,
  valueOfTimePerMinute: 0.15,
  onlySelf: true,
  maxPriceAgeHours: 72,
  avoidMotorway: false,
  avoidTolls: false,
  avoidFerries: false,
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("offline — i dati non vengono mai serviti da una cache e l'errore è chiaro", () => {
  it("isOffline riflette navigator.onLine", () => {
    setOnline(false);
    expect(isOffline()).toBe(true);
    vi.restoreAllMocks();
    setOnline(true);
    expect(isOffline()).toBe(false);
  });

  it("senza rete la ricerca fallisce con un ApiError OFFLINE e un messaggio chiaro (la shell resta caricabile)", async () => {
    setOnline(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await searchStations(body, new AbortController().signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "OFFLINE", status: 0, message: OFFLINE_MESSAGE });
    expect((error as ApiError).message).toMatch(/offline/i);
    expect((error as ApiError).message).toMatch(/prezzi e mappa non sono disponibili offline/);
  });

  it("ogni richiesta dati va alla rete: nessuna cache applicativa (fetch chiamato a ogni ricerca)", async () => {
    setOnline(true);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) });
    vi.stubGlobal("fetch", fetchSpy);
    await autocompleteAddress("via roma", undefined, new AbortController().signal);
    await autocompleteAddress("via roma", undefined, new AbortController().signal);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("online ma server non raggiungibile resta l'errore di rete di sempre (non «offline»)", async () => {
    setOnline(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await searchStations(body, new AbortController().signal).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("l'annullamento di una richiesta non è mai scambiato per offline", async () => {
    setOnline(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
    const error = await searchStations(body, new AbortController().signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DOMException);
  });

  it("SearchError mostra «Sei offline» con il messaggio", () => {
    render(<SearchError error={new ApiError("OFFLINE", OFFLINE_MESSAGE, 0)} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sei offline");
    expect(screen.getByRole("alert")).toHaveTextContent(OFFLINE_MESSAGE);
  });
});

describe("useOnlineStatus", () => {
  it("segue gli eventi online/offline", () => {
    const spy = setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
    spy.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);
    spy.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
  });
});
