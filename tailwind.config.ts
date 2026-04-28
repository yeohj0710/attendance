import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172126",
        muted: "#5b666d",
        line: "#dde4e8",
        field: "#f7fafb",
        accent: "#1b7f79",
        warn: "#b25d1a",
        danger: "#b42318",
      },
      boxShadow: {
        panel: "0 10px 30px rgba(23, 33, 38, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
