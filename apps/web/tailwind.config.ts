import type { Config } from "tailwindcss";

/**
 * BiteBox design tokens. Deliberately small: one ink scale for text and primary
 * actions, one hairline, one subtle fill, and a single warm accent used sparingly
 * for brand moments. Status colours exist only to carry meaning.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#111111",
          soft: "#4A4A4A",
          muted: "#8A8A8A",
        },
        line: {
          DEFAULT: "#ECECEC",
          strong: "#D6D6D6",
        },
        subtle: "#F6F6F4",
        accent: {
          DEFAULT: "#F0532D",
          soft: "#FFF2ED",
        },
        success: {
          DEFAULT: "#15803D",
          soft: "#EEF7F0",
        },
        danger: {
          DEFAULT: "#C62828",
          soft: "#FDF1F1",
        },
        warn: {
          DEFAULT: "#A15C07",
          soft: "#FDF6E7",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -8px rgb(0 0 0 / 0.08)",
        pop: "0 24px 64px -16px rgb(0 0 0 / 0.22)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "sheet-up": { from: { transform: "translateY(24px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        "toast-in": { from: { transform: "translateY(-8px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "sheet-up": "sheet-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "toast-in": "toast-in 180ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
