import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#140f1e",
        dusk: "#241b36",
        dusk2: "#2f2547",
        vellum: "#ece2cd",
        vellum2: "#b9ad99",
        ember: "#f0a35e",
        moss: "#8fb98a",
        blood: "#c8494c",
        fire: "#e98a4f",
        water: "#7fb6d6",
        wind: "#a8c686",
        shadow: "#b19ad9",
        light: "#e9d27c",
      },
      fontFamily: {
        display: ["Fraunces", "Noto Serif SC", "Georgia", "serif"],
        sans: ["Manrope", "Noto Serif SC", "system-ui", "sans-serif"],
      },
      keyframes: {
        breathe: { "0%,100%": { textShadow: "0 0 18px rgba(240,163,94,.25)" }, "50%": { textShadow: "0 0 42px rgba(240,163,94,.75)" } },
        hit: { "0%,100%": { transform: "translateX(0)" }, "25%": { transform: "translateX(-8px)" }, "75%": { transform: "translateX(8px)" } },
        rise: { "0%": { transform: "translate(-50%,0)", opacity: "1" }, "100%": { transform: "translate(-50%,-60px)", opacity: "0" } },
        reveal: { "0%": { transform: "scale(.96)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } },
        flicker: { "0%,100%": { opacity: ".55" }, "50%": { opacity: ".9" } },
      },
      animation: {
        breathe: "breathe 1.4s ease-in-out infinite",
        hit: "hit .35s ease",
        rise: "rise 1.1s ease-out forwards",
        reveal: "reveal .3s ease-out",
        flicker: "flicker 3.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
