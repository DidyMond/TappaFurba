import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetInstallPromptCapture, type BeforeInstallPromptEvent } from "../hooks/useInstallPrompt";
import { InstallBanner } from "./InstallBanner";

function offerInstall() {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }) });
  act(() => void window.dispatchEvent(event));
  return prompt;
}

beforeEach(() => {
  sessionStorage.clear();
  resetInstallPromptCapture();
});

describe("InstallBanner", () => {
  it("non compare se il browser non offre l'installazione", () => {
    render(<InstallBanner />);
    expect(screen.queryByRole("complementary", { name: "Installa l'app" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Installa TappaFurba" })).not.toBeInTheDocument();
  });

  it("compare quando il browser offre l'installazione, con CTA «Installa TappaFurba» e «Non ora»", () => {
    render(<InstallBanner />);
    offerInstall();
    expect(screen.getByRole("complementary", { name: "Installa l'app" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Installa TappaFurba" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Non ora" })).toBeInTheDocument();
  });

  it("segue DESIGN.md: rounded-lg, shadow-md, bg-surface-container-lowest; CTA bg-primary-strong text-on-primary", () => {
    render(<InstallBanner />);
    offerInstall();
    const banner = screen.getByRole("complementary", { name: "Installa l'app" });
    expect(banner).toHaveClass("rounded-lg", "shadow-md", "bg-surface-container-lowest");
    expect(screen.getByRole("button", { name: "Installa TappaFurba" })).toHaveClass("bg-primary-strong", "text-on-primary");
  });

  it("è discreto: una riga nel flusso della pagina (non fisso, nessun overlay né dialog), con «Non ora» come icona accessibile", () => {
    render(<InstallBanner />);
    offerInstall();
    const banner = screen.getByRole("complementary", { name: "Installa l'app" });
    expect(banner).not.toHaveClass("fixed");
    expect(banner).not.toHaveClass("absolute");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const close = screen.getByRole("button", { name: "Non ora" });
    expect(close).toHaveAttribute("title", "Non ora");
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("«Installa TappaFurba» apre la finestra del browser e poi il banner scompare", async () => {
    const user = userEvent.setup();
    render(<InstallBanner />);
    const prompt = offerInstall();
    await user.click(screen.getByRole("button", { name: "Installa TappaFurba" }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Installa TappaFurba" })).not.toBeInTheDocument();
  });

  it("«Non ora» lo chiude e non torna nella stessa sessione", async () => {
    const user = userEvent.setup();
    const first = render(<InstallBanner />);
    offerInstall();
    await user.click(screen.getByRole("button", { name: "Non ora" }));
    expect(screen.queryByRole("button", { name: "Installa TappaFurba" })).not.toBeInTheDocument();
    first.unmount();

    render(<InstallBanner />);
    offerInstall();
    expect(screen.queryByRole("button", { name: "Installa TappaFurba" })).not.toBeInTheDocument();
  });
});
