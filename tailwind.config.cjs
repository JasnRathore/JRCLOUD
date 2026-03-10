/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        body: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        base: "hsl(var(--base))",
        surface: "hsl(var(--surface))",
        surface2: "hsl(var(--surface-2))",
        text: "hsl(var(--text))",
        muted: "hsl(var(--muted))",
        accent: "hsl(var(--accent))",
        accent2: "hsl(var(--accent-2))",
        ring: "hsl(var(--ring))",
      },
      boxShadow: {
        glow: "0 0 0 1px hsl(var(--ring) / 0.3), 0 18px 40px -28px hsl(var(--ring) / 0.7)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        reveal: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        float: "float 9s ease-in-out infinite",
        reveal: "reveal 0.6s ease forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
