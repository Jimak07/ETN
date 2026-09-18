import type { Config } from "tailwindcss";

/**
 * Design system for the ETN Pulse utility hub.
 *
 * Deep dark mode: slate-950 canvas, translucent slate-900/50 surfaces with
 * backdrop blur, Electroneum cyan accents and status colours that map 1:1 to
 * the latency thresholds used by the monitoring engine.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        etn: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
          950: "#083344",
        },
        status: {
          healthy: "#34d399",
          degraded: "#fbbf24",
          offline: "#fb7185",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "JetBrains Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(34 211 238 / 0.20), 0 0 32px -6px rgb(34 211 238 / 0.45)",
        "glow-emerald":
          "0 0 0 1px rgb(52 211 153 / 0.20), 0 0 32px -6px rgb(52 211 153 / 0.40)",
        card: "0 28px 60px -40px rgb(2 6 23 / 0.95)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.7)", opacity: "0.75" },
          "70%": { transform: "scale(2.4)", opacity: "0" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        sweep: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-up": "fade-up 420ms cubic-bezier(0.16, 1, 0.3, 1) both",
        sweep: "sweep 2.4s linear infinite",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
