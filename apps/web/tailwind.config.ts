import type { Config } from "tailwindcss";

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
        brand: {
          DEFAULT: "#D92D47",
          hover: "#B9233A",
          light: "#FDF2F4",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F8F8FA",
        },
        text: {
          primary: "#1F2026",
          secondary: "#62646C",
        },
        border: "#E6E7EB",
        success: {
          DEFAULT: "#24963F",
          light: "#E9F7EC",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
