import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* GANTI SAAT WARNA MEREK SUDAH PASTI.
         *
         * Nilai sekarang (#2f6b52, HSL 155deg 39% 30%) adalah PLACEHOLDER —
         * dipilih hanya supaya jelas bukan navy milik proyek lain. Warna merek
         * duduk di `brand-700`; skala 50-950 diturunkan dengan hue dan
         * saturasi yang sama. Kalau warna merek diganti, turunkan ulang
         * seluruh skalanya, jangan hanya menukar 700 — nada yang tidak sejalan
         * langsung terlihat pada tombol dan sidebar. */
        brand: {
          50:  "#f2faf6",
          100: "#e3f4ea",
          200: "#c6e8d5",
          300: "#9bd5b6",
          400: "#62b98c",
          500: "#429a6c",
          600: "#35825a",
          700: "#2f6b52",
          800: "#275544",
          900: "#1e3f33",
          950: "#12271f",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        soft: "0 4px 24px -8px rgb(47 107 82 / 0.15)",
        drawer: "-8px 0 32px -12px rgb(15 23 42 / 0.18)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        /* Sengaja hanya dua. Aplikasi yang dipakai delapan jam sehari tidak
         * boleh membuat penggunanya menunggu animasi; sisanya cukup
         * `transition-colors`. */
        "fade-in": "fade-in 0.2s ease-out",
        "slide-in": "slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
