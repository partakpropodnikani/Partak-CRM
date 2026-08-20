import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1A1814",
        "ink-1": "#302D27",
        "ink-2": "#5B554C",
        "ink-3": "#8C8579",
        paper: "#F6F4EF",
        line: "#E8E3DA",
        "line-2": "#D8D1C5",
        gold: "#C5A35A",
        "gold-deep": "#A6854B",
        bad: "#A33A32",
        "bad-bg": "#F8E9E7",
      },
      fontFamily: {
        display: ["Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;