import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_EMAIL, DONATE_URL, PROJECT_REPO_URL } from "../../lib/links";
import { MAP_STYLE_KEY } from "../../lib/mapStyle";
import { RECENT_ROUTES_KEY } from "../../lib/recentRoutes";
import { SETTINGS_KEY } from "../../lib/settings";
import { PRIVACY_UPDATED, PrivacyScreen } from "./PrivacyScreen";

const renderScreen = () =>
  render(
    <MemoryRouter>
      <PrivacyScreen />
    </MemoryRouter>,
  );

beforeEach(() => {
  window.scrollTo = vi.fn(); // jsdom non lo implementa: la pagina parte dall'alto
});

const section = (id: string) => screen.getByTestId(`privacy-section-${id}`);

describe("PrivacyScreen", () => {
  it("ha il titolo, la data di aggiornamento e un link di ritorno alle Impostazioni", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Privacy e note legali" })).toBeInTheDocument();
    expect(screen.getByText(`Ultimo aggiornamento: ${PRIVACY_UPDATED}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Impostazioni" })).toHaveAttribute("href", "/settings");
  });

  it("ogni sezione è una regione con il suo titolo (h2)", () => {
    renderScreen();
    for (const id of ["sintesi", "titolare", "dati", "dispositivo", "log", "terzi", "base", "diritti", "attribuzioni", "modifiche"]) {
      const heading = within(section(id)).getByRole("heading", { level: 2 });
      expect(section(id)).toHaveAccessibleName(heading.textContent!);
    }
  });

  it("indica il contatto del titolare con un link mailto (titolare e diritti)", () => {
    renderScreen();
    const mails = screen.getAllByRole("link", { name: CONTACT_EMAIL });
    expect(mails.length).toBeGreaterThanOrEqual(2);
    for (const mail of mails) expect(mail).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
  });

  it("nomina i fornitori terzi: Mapbox, Google Fonts, Host.it", () => {
    renderScreen();
    const terzi = within(section("terzi"));
    expect(terzi.getByText(/Mapbox, Inc\./)).toBeInTheDocument();
    expect(terzi.getByText(/Google LLC/)).toBeInTheDocument();
    expect(terzi.getByText("Host.it")).toBeInTheDocument();
    expect(within(section("dati")).getByText("fonts.googleapis.com", { selector: "code" })).toBeInTheDocument();
  });

  it("dichiara l'assenza di cookie e analytics e la geolocalizzazione solo su richiesta", () => {
    renderScreen();
    expect(within(section("sintesi")).getByText(/Nessun account, nessun cookie, nessuna pubblicità/)).toBeInTheDocument();
    expect(within(section("sintesi")).getByText(/solo se premi il pulsante «Usa la posizione attuale»/)).toBeInTheDocument();
  });

  it("cita le chiavi di localStorage che l'app usa davvero (se una cambia, il testo va riletto)", () => {
    renderScreen();
    const dispositivo = within(section("dispositivo"));
    for (const key of [SETTINGS_KEY, RECENT_ROUTES_KEY, MAP_STYLE_KEY]) expect(dispositivo.getByText(key, { selector: "code" })).toBeInTheDocument();
  });

  it("richiama le attribuzioni: MIMIT IODL 2.0, OpenStreetMap, marchi dei distributori, non affiliazione", () => {
    renderScreen();
    const attribuzioni = within(section("attribuzioni"));
    expect(attribuzioni.getByRole("link", { name: "IODL 2.0" })).toHaveAttribute("href", "https://www.dati.gov.it/iodl/2.0/");
    expect(attribuzioni.getByRole("link", { name: /OpenStreetMap/ })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    expect(attribuzioni.getByText(/marchi dei rispettivi titolari/)).toBeInTheDocument();
    expect(attribuzioni.getByText("non è affiliato, sponsorizzato o approvato")).toBeInTheDocument();
    expect(attribuzioni.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", PROJECT_REPO_URL);
  });

  it("i link esterni si aprono in una nuova scheda senza passare referrer né opener", () => {
    renderScreen();
    const external = screen.getAllByRole("link").filter((a) => a.getAttribute("href")!.startsWith("https://"));
    expect(external.length).toBeGreaterThan(4);
    for (const a of external) {
      expect(a, a.getAttribute("href")!).toHaveAttribute("target", "_blank");
      expect(a, a.getAttribute("href")!).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});

describe("indirizzi del progetto", () => {
  it("il link di donazione è quello di .github/FUNDING.yml", () => {
    const funding = readFileSync(resolve(__dirname, "../../../../../.github/FUNDING.yml"), "utf8");
    expect(funding).toContain(DONATE_URL);
  });
});
