import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "diff-add": "#22c55e",
        "diff-delete": "#ef4444",
        "diff-update": "#f59e0b",
        "diff-move": "#38bdf8",
        "diff-neutral": "#94a3b8",
      },
      boxShadow: {
        "diff-glow": "0 0 0 1px rgba(59, 130, 246, 0.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;
