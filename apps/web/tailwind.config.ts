import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * Token portati 1:1 dal front-matter di ../../DESIGN.md (unica fonte di
 * verità). Non aggiungere/alterare valori qui senza prima aggiornare
 * DESIGN.md: questo file deve restare uno specchio fedele, non una seconda
 * fonte di verità.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#f8f9ff",
        "surface-dim": "#cbdbf5",
        "surface-bright": "#f8f9ff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#eff4ff",
        "surface-container": "#e5eeff",
        "surface-container-high": "#dce9ff",
        "surface-container-highest": "#d3e4fe",
        "on-surface": "#0b1c30",
        "on-surface-variant": "#3d4a42",
        "inverse-surface": "#213145",
        "inverse-on-surface": "#eaf1ff",
        outline: "#6d7a72",
        "outline-variant": "#bccac0",
        "surface-tint": "#059669",
        primary: "#059669",
        "primary-strong": "#047857",
        "on-primary": "#ffffff",
        "primary-container": "#10B981",
        "on-primary-container": "#f5fff7",
        "inverse-primary": "#68dba9",
        secondary: "#0284C7",
        "on-secondary": "#ffffff",
        "secondary-container": "#5bb8fe",
        "on-secondary-container": "#00476e",
        tertiary: "#0F172A",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#334155",
        "on-tertiary-container": "#fefcff",
        error: "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",
        "primary-fixed": "#85f8c4",
        "primary-fixed-dim": "#68dba9",
        "on-primary-fixed": "#002114",
        "on-primary-fixed-variant": "#005137",
        "secondary-fixed": "#cce5ff",
        "secondary-fixed-dim": "#93ccff",
        "on-secondary-fixed": "#001d31",
        "on-secondary-fixed-variant": "#004b73",
        "tertiary-fixed": "#dae2fd",
        "tertiary-fixed-dim": "#bec6e0",
        "on-tertiary-fixed": "#131b2e",
        "on-tertiary-fixed-variant": "#3f465c",
        background: "#f8f9ff",
        "on-background": "#0b1c30",
        "surface-variant": "#d3e4fe",
      },
      borderRadius: {
        sm: "0.5rem",
        DEFAULT: "1rem",
        md: "1.5rem",
        lg: "2rem",
        xl: "3rem",
        full: "9999px",
      },
      spacing: {
        gutter: "1rem",
        "gutter-tablet": "1.25rem",
        "gutter-desktop": "1.5rem",
        margin: "1rem",
        "margin-tablet": "1.5rem",
        "margin-desktop": "2rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "0.75rem",
        "space-lg": "1rem",
        "space-xl": "1.5rem",
      },
      fontFamily: {
        "headline-2xl": ["Plus Jakarta Sans", "sans-serif"],
        "headline-xl": ["Plus Jakarta Sans", "sans-serif"],
        "headline-lg": ["Plus Jakarta Sans", "sans-serif"],
        "headline-md": ["Plus Jakarta Sans", "sans-serif"],
        "headline-sm": ["Plus Jakarta Sans", "sans-serif"],
        "body-lg": ["Inter", "sans-serif"],
        "body-md": ["Inter", "sans-serif"],
        "body-sm": ["Inter", "sans-serif"],
        "label-lg": ["Inter", "sans-serif"],
        "label-md": ["Inter", "sans-serif"],
        "label-sm": ["Inter", "sans-serif"],
        "numeric-stat": ["Plus Jakarta Sans", "sans-serif"],
      },
      fontSize: {
        "headline-2xl": ["48px", { lineHeight: "56px", letterSpacing: "-0.03em", fontWeight: "800" }],
        "headline-xl": ["36px", { lineHeight: "44px", letterSpacing: "-0.03em", fontWeight: "800" }],
        "headline-xl-mobile": ["28px", { lineHeight: "34px", letterSpacing: "-0.02em", fontWeight: "800" }],
        "headline-lg": ["28px", { lineHeight: "36px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg-mobile": ["22px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "headline-md": ["20px", { lineHeight: "26px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-sm": ["16px", { lineHeight: "22px", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-md": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "body-sm": ["12px", { lineHeight: "16px", fontWeight: "400" }],
        "label-lg": ["14px", { lineHeight: "18px", letterSpacing: "0.01em", fontWeight: "600" }],
        "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "600" }],
        "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.04em", fontWeight: "700" }],
        "numeric-stat": ["24px", { lineHeight: "28px", letterSpacing: "-0.02em", fontWeight: "800" }],
      },
    },
  },
  plugins: [
    /*
     * Campi di testo (input, textarea, select): iOS Safari zooma la pagina al focus se il testo è sotto i 16px. Per questo `field-text`
     * vale body-lg (16px) sotto md o con puntatore impreciso (dito, anche su iPad) e body-md (14px, la dimensione di sempre) con mouse da md
     * in su. Usa solo token esistenti; niente `maximum-scale` né `user-scalable` nel meta viewport (accessibilità, e iOS li ignora).
     * Sui campi non si mette altra classe `text-*` di dimensione: andrebbe a coprire questa.
     */
    plugin(({ addComponents, theme }) => {
      const size = (token: string) => {
        const value = theme(`fontSize.${token}`) as string | [string, unknown];
        return Array.isArray(value) ? value[0] : value;
      };
      addComponents({
        ".field-text": {
          fontSize: size("body-md"),
          "@media (max-width: 767.98px), (pointer: coarse)": { fontSize: size("body-lg") },
        },
      });
    }),
  ],
};

export default config;
