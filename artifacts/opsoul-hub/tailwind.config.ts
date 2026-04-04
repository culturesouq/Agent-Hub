import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        headline: ['"Space Grotesk"', "sans-serif"],
        sans:     ["Manrope",         "sans-serif"],
        label:    ["Inter",           "sans-serif"],
        mono:     ['"Space Mono"',    "monospace"],
      },
      borderRadius: {
        xs:      "0.125rem",
        sm:      "0.125rem",
        DEFAULT: "0.125rem",
        md:      "0.25rem",
        lg:      "0.25rem",
        xl:      "0.5rem",
        "2xl":   "1rem",
        "3xl":   "1.5rem",
        full:    "9999px",
      },
      colors: {
        primary: { DEFAULT: "#e0b6ff", foreground: "#3f1a6c", container: "#6f389b" },
        secondary: { DEFAULT: "#8cd4c3", foreground: "#03372d" },
        background: "#050508",
        foreground: "#e6e3e8",
        border: "#4a4658",
        input: "#1f1f23",
        ring: "#e0b6ff",
        card: { DEFAULT: "#1f1f23", foreground: "#e6e3e8", border: "#4a4658" },
        muted: { DEFAULT: "#28272c", foreground: "#b8b3c0" },
        accent: { DEFAULT: "#6f389b", foreground: "#e0b6ff" },
        destructive: { DEFAULT: "#ffb4ab", foreground: "#690005" },
        sidebar: {
          DEFAULT: "#1a1a1e",
          foreground: "#e6e3e8",
          border: "#2d2b38",
          primary: "#e0b6ff",
          "primary-foreground": "#3f1a6c",
          accent: "#1f1f23",
          "accent-foreground": "#e6e3e8",
          ring: "#e0b6ff",
        },
        surface: {
          DEFAULT: "#14141a",
          dim: "#0e0e12",
          "container-lowest": "#101014",
          "container-low": "#1a1a1e",
          container: "#1f1f23",
          "container-high": "#28272c",
          "container-highest": "#34333a",
        },
        "on-surface": { DEFAULT: "#e6e3e8", variant: "#cac4cf" },
      },
    },
  },
  plugins: [],
};

export default config;
