import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        muted: "#647086",
        line: "#e1e7f0",
        field: "#f8fbff",
        accent: "#4568f5",
        accentSoft: "#eef3ff",
        warn: "#b25d1a",
        danger: "#b42318",
      },
      boxShadow: {
        panel: "0 20px 50px -38px rgba(23, 32, 51, 0.34)",
      },
    },
  },
  plugins: [],
};

export default config;
