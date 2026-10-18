import { describe, expect, it, vi } from "vitest";
import { detectPlatform, navigationLink, navigationLinks, primaryNavigationLink, launchNavigation, orderedNavigationLinks } from "./navigation";

const target = { name: "1858 BREGNANO", lat: 45.685986, lon: 9.054773 };

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

describe("detectPlatform", () => {
  it("riconosce iOS, Android e desktop", () => {
    expect(detectPlatform(IPHONE)).toBe("ios");
    expect(detectPlatform(ANDROID)).toBe("android");
    expect(detectPlatform(WINDOWS)).toBe("other");
    expect(detectPlatform(MAC, 0)).toBe("other");
  });

  it("iPadOS che si presenta come Mac si riconosce dal multitouch", () => {
    expect(detectPlatform(MAC, 5)).toBe("ios");
  });
});

describe("navigationLink", () => {
  it("Apple Maps: destinazione, guida e nome", () => {
    const url = new URL(navigationLink("apple", target).url);
    expect(url.origin + url.pathname).toBe("https://maps.apple.com/");
    expect(url.searchParams.get("daddr")).toBe("45.685986,9.054773");
    expect(url.searchParams.get("dirflg")).toBe("d");
    expect(url.searchParams.get("q")).toBe("1858 BREGNANO");
  });

  it("Google Maps: API universale di direzioni in auto", () => {
    const url = new URL(navigationLink("google", target).url);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("45.685986,9.054773");
    expect(url.searchParams.get("travelmode")).toBe("driving");
  });

  it("Waze: parte subito la navigazione", () => {
    const url = new URL(navigationLink("waze", target).url);
    expect(url.origin).toBe("https://waze.com");
    expect(url.searchParams.get("ll")).toBe("45.685986,9.054773");
    expect(url.searchParams.get("navigate")).toBe("yes");
  });

  it("il nome con caratteri speciali viene codificato", () => {
    const link = navigationLink("apple", { ...target, name: "Q8 & C. — Via/Roma?" });
    expect(new URL(link.url).searchParams.get("q")).toBe("Q8 & C. — Via/Roma?");
  });
});

describe("primaryNavigationLink / navigationLinks", () => {
  it("iOS → Apple Maps, Android → Google Maps", () => {
    expect(primaryNavigationLink("ios", target)?.app).toBe("apple");
    expect(primaryNavigationLink("android", target)?.app).toBe("google");
  });

  it("altre piattaforme → nessun link diretto, serve il menu", () => {
    expect(primaryNavigationLink("other", target)).toBeNull();
  });

  it("il menu offre Google Maps, Apple Maps e Waze", () => {
    expect(navigationLinks(target).map((l) => l.label)).toEqual(["Google Maps", "Apple Maps", "Waze"]);
  });
});

describe("launchNavigation (Apri nel Navigatore)", () => {
  const target = { name: "1858 BREGNANO", lat: 45.685986, lon: 9.054773 };
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36";
  const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

  it("iOS apre Apple Maps con le coordinate corrette", () => {
    const open = vi.fn();
    const link = launchNavigation(target, { userAgent: IPHONE, maxTouchPoints: 5, open });
    expect(link?.app).toBe("apple");
    expect(open).toHaveBeenCalledWith(expect.stringContaining("daddr=45.685986,9.054773"), "_blank", "noopener,noreferrer");
  });

  it("Android apre Google Maps con le coordinate corrette", () => {
    const open = vi.fn();
    const link = launchNavigation(target, { userAgent: ANDROID, maxTouchPoints: 5, open });
    expect(link?.app).toBe("google");
    expect(open).toHaveBeenCalledWith(expect.stringContaining("destination=45.685986,9.054773"), "_blank", "noopener,noreferrer");
  });

  it("iPadOS (si presenta come Mac, ma con multitouch) conta come iOS", () => {
    const open = vi.fn();
    expect(launchNavigation(target, { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5, open })?.app).toBe("apple");
  });

  it("desktop o sistema sconosciuto: non apre nulla e restituisce null (serve il menu)", () => {
    const open = vi.fn();
    expect(launchNavigation(target, { userAgent: WINDOWS, maxTouchPoints: 0, open })).toBeNull();
    expect(launchNavigation(target, { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0, open })).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});

describe("orderedNavigationLinks (menu «Apri nel Navigatore»)", () => {
  const spot = { name: "1858 BREGNANO", lat: 45.685986, lon: 9.054773 };
  const apps = (options: ReturnType<typeof orderedNavigationLinks>) => options.links.map((l) => l.app);

  it("iOS: Apple Maps per prima e consigliata, poi Google Maps e Waze", () => {
    const options = orderedNavigationLinks(spot, { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", maxTouchPoints: 5 });
    expect(options.recommended).toBe("apple");
    expect(apps(options)).toEqual(["apple", "google", "waze"]);
  });

  it("Android: Google Maps per prima e consigliata, poi Apple Maps e Waze", () => {
    const options = orderedNavigationLinks(spot, { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)", maxTouchPoints: 5 });
    expect(options.recommended).toBe("google");
    expect(apps(options)).toEqual(["google", "apple", "waze"]);
  });

  it("desktop o sconosciuto: nessuna consigliata, ordine Google Maps, Apple Maps, Waze", () => {
    const options = orderedNavigationLinks(spot, { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", maxTouchPoints: 0 });
    expect(options.recommended).toBeNull();
    expect(apps(options)).toEqual(["google", "apple", "waze"]);
  });

  it("il consigliato ha lo stesso link del lancio diretto, con le stesse coordinate", () => {
    const env = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", maxTouchPoints: 5 };
    const direct = primaryNavigationLink(detectPlatform(env.userAgent, env.maxTouchPoints), spot)!;
    expect(orderedNavigationLinks(spot, env).links[0]).toEqual(direct);
  });
});
