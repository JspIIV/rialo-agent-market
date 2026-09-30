import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // "rialo" is the accent scale, remapped from green to Obsidian-Luxe gold.
        // Existing text-rialo-*/bg-rialo-* classes now render gold automatically.
        rialo: {
          50:  "#fbf3df",
          100: "#f7e6bd",
          300: "#f2ce84",
          400: "#e8b44f",
          500: "#d69e36",
          600: "#b8862e",
          900: "#4a3d22",
        },
        // Readable text on the near-black panels (WCAG AA on #101010).
        ink: {
          primary:   "#F2F0EA",
          secondary: "#C8C4B8",
          muted:     "#8A867C",
        },
        copper: {
          300: "#d9a878",
          400: "#c88a5a",
          500: "#b0764a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
