import type { Config } from "tailwindcss";

/**
 * OpSoul Hub — Stitch Design System configuration.
 *
 * Tailwind v4 note: all color/font/radius tokens are defined in src/index.css
 * via `@theme inline` (the v4 canonical approach). This file extends the theme
 * with explicitly-typed values that are kept in sync with the CSS tokens and
 * provides IDE IntelliSense for Tailwind class generation.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        headline: ["Space Grotesk", "sans-serif"],
        sans: ["Manrope", "sans-serif"],
        label: ["Inter", "sans-serif"],
        mono: ["Space Mono", "monospace"],
      },
      borderRadius: {
        sm:   "4px",
        md:   "6px",
        lg:   "8px",
        xl:   "12px",
        "2xl": "16px",
        "3xl": "24px",
        full: "9999px",
      },
      colors: {
        primary: {
          DEFAULT: "hsl(276 100% 86%)",
          foreground: "hsl(278 83% 25%)",
        },
        secondary: {
          DEFAULT: "hsl(168 43% 69%)",
          foreground: "hsl(172 100% 11%)",
        },
        background: "hsl(240 29% 4%)",
        foreground: "hsl(282 7% 90%)",
        border: "hsl(256 11% 30%)",
        card: {
          DEFAULT: "hsl(240 7% 13%)",
          foreground: "hsl(282 7% 90%)",
        },
        muted: {
          DEFAULT: "hsl(264 6% 17%)",
          foreground: "hsl(264 14% 80%)",
        },
        accent: {
          DEFAULT: "hsl(277 44% 41%)",
          foreground: "hsl(276 100% 86%)",
        },
        destructive: {
          DEFAULT: "hsl(5 100% 84%)",
          foreground: "hsl(356 100% 29%)",
        },
        sidebar: {
          DEFAULT: "hsl(240 7% 11%)",
          foreground: "hsl(282 7% 90%)",
          border: "hsl(256 11% 22%)",
          primary: "hsl(276 100% 86%)",
          "primary-foreground": "hsl(278 83% 25%)",
          accent: "hsl(240 7% 13%)",
          "accent-foreground": "hsl(282 7% 90%)",
          ring: "hsl(276 100% 86%)",
        },
        surface: {
          DEFAULT: "hsl(240 7% 9%)",
          dim: "hsl(240 16% 6%)",
          "container-lowest": "hsl(240 11% 7%)",
          "container-low": "hsl(240 7% 11%)",
          container: "hsl(240 7% 13%)",
          "container-high": "hsl(264 6% 17%)",
          "container-highest": "hsl(264 6% 22%)",
        },
        "on-surface": {
          DEFAULT: "hsl(282 7% 90%)",
          variant: "hsl(264 14% 70%)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
