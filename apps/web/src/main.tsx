import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { captureInstallPrompt } from "./hooks/useInstallPrompt";
import "./index.css";

// PWA: il service worker (solo nella build di produzione) mette in cache la shell dell'app; si aggiorna da solo a ogni deploy.
registerSW({ immediate: true });
// `beforeinstallprompt` può scattare prima del montaggio di React: lo si cattura subito.
captureInstallPrompt();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Elemento #root non trovato in index.html');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
