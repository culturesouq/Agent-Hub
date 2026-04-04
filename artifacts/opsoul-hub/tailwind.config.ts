import type { Config } from "tailwindcss";

/**
 * OpSoul Hub — Stitch Design System (Tailwind v4)
 *
 * Tailwind v4 note: token values below are also exposed via `@theme inline` in
 * src/index.css so Tailwind utility classes (`bg-primary`, `text-secondary`, etc.)
 * work with opacity modifiers (e.g. `bg-primary/10`). The canonical hex values are
 * the source of truth; the HSL equivalents in index.css are derived from them.
 *
 * Typography:
 *   font-headline  → Space Grotesk  (section headings, hero text, dialog titles)
 *   font-sans      → Manrope        (body copy, descriptions — Tailwind default)
 *   font-label     → Inter          (UI labels, nav items, form labels, badges)
 *   font-mono      → Space Mono     (code blocks, API examples, technical IDs)
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
        headline: ['"Space Grotesk"', "sans-serif"],
        sans:     ["Manrope",         "sans-serif"],
        label:    ["Inter",           "sans-serif"],
        mono:     ['"Space Mono"',    "monospace"],
      },

      /**
       * Stitch radius scale (MD3-aligned tight scale).
       * All Tailwind rounded-* utilities map to these values.
       *
       *   rounded-xs   →  2px  (0.125rem)   subtle separation
       *   rounded-sm   →  4px  (0.25rem)    chips / small tags
       *   rounded      →  4px  (0.25rem)    default (same as sm)
       *   rounded-md   →  6px  (0.375rem)   buttons / inputs
       *   rounded-lg   →  8px  (0.5rem)     cards / dialog content
       *   rounded-xl   → 12px  (0.75rem)    elevated panels
       *   rounded-2xl  → 16px  (1rem)       glass-panel sections
       *   rounded-3xl  → 24px  (1.5rem)     hero / modal sheets
       *   rounded-full →  ∞               pills / avatar rings
       */
      borderRadius: {
        xs:    "0.125rem",
        sm:    "0.25rem",
        DEFAULT: "0.25rem",
        md:    "0.375rem",
        lg:    "0.5rem",
        xl:    "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        full:  "9999px",
      },

      colors: {
        /* Stitch primary — light purple #e0b6ff */
        primary: {
          DEFAULT:    "#e0b6ff",
          foreground: "#3f1a6c",
          container:  "#6f389b",
          border:     "rgba(224,182,255,0.25)",
        },

        /* Stitch secondary — teal #8cd4c3 */
        secondary: {
          DEFAULT:    "#8cd4c3",
          foreground: "#03372d",
          border:     "rgba(140,212,195,0.25)",
        },

        /* Surfaces */
        background: "#050508",
        foreground: "#e6e3e8",

        /* Stitch MD3 surface hierarchy */
        surface: {
          DEFAULT:             "#14141a",
          dim:                 "#0e0e12",
          "container-lowest":  "#101014",
          "container-low":     "#1a1a1e",
          container:           "#1f1f23",
          "container-high":    "#28272c",
          "container-highest": "#34333a",
        },

        "on-surface": {
          DEFAULT: "#e6e3e8",
          variant: "#cac4cf",
        },

        /* Component tokens */
        border:  "#4a4658",
        input:   "#1f1f23",
        ring:    "#e0b6ff",

        card: {
          DEFAULT:    "#1f1f23",
          foreground: "#e6e3e8",
          border:     "#4a4658",
        },

        muted: {
          DEFAULT:    "#28272c",
          foreground: "#b8b3c0",
        },

        accent: {
          DEFAULT:    "#6f389b",
          foreground: "#e0b6ff",
        },

        destructive: {
          DEFAULT:    "#ffb4ab",
          foreground: "#690005",
        },

        /* Sidebar */
        sidebar: {
          DEFAULT:              "#1a1a1e",
          foreground:           "#e6e3e8",
          border:               "#2d2b38",
          primary:              "#e0b6ff",
          "primary-foreground": "#3f1a6c",
          accent:               "#1f1f23",
          "accent-foreground":  "#e6e3e8",
          ring:                 "#e0b6ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
