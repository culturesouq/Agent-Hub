import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        headline: ['"Space Grotesk"', "sans-serif"],
        sans:     ["Manrope",         "sans-serif"],
        label:    ["Manrope",         "sans-serif"],
        mono:     ['"Space Mono"',    "monospace"],
      },
      borderRadius: {
        xs:      "0.125rem",
        sm:      "0.25rem",
        DEFAULT: "0.5rem",
        md:      "0.5rem",
        lg:      "0.75rem",
        xl:      "1rem",
        "2xl":   "1.25rem",
        "3xl":   "1.5rem",
        full:    "9999px",
      },
      colors: {
        primary: { DEFAULT: "#cd96ff", foreground: "#2c0d54", container: "#6b2ea8" },
        secondary: { DEFAULT: "#40cef3", foreground: "#003a4a" },
        tertiary:  { DEFAULT: "#ff6a9f" },
        background: "#0e0e11",
        foreground: "#e6e3e8",
        border: "#4a4658",
        input: "#1f1f23",
        ring: "#cd96ff",
        card: { DEFAULT: "#1a1a1e", foreground: "#e6e3e8", border: "#4a4658" },
        muted: { DEFAULT: "#28272c", foreground: "#b8b3c0" },
        accent: { DEFAULT: "#6b2ea8", foreground: "#cd96ff" },
        destructive: { DEFAULT: "#ffb4ab", foreground: "#690005" },
        sidebar: {
          DEFAULT: "#141418",
          foreground: "#e6e3e8",
          border: "#252330",
          primary: "#cd96ff",
          "primary-foreground": "#2c0d54",
          accent: "#1d1d21",
          "accent-foreground": "#e6e3e8",
          ring: "#cd96ff",
        },
        surface: {
          DEFAULT: "#131317",
          dim: "#0e0e11",
          "container-lowest": "#0f0f12",
          "container-low": "#18181c",
          container: "#1d1d21",
          "container-high": "#262529",
          "container-highest": "#323036",
        },
        "on-surface": { DEFAULT: "#e6e3e8", variant: "#cac4cf" },
      },
    },
  },
  plugins: [],
};

export default config;
