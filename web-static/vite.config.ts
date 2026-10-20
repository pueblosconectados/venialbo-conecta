import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Cloudflare Web Analytics: cuenta las visitas sin cookies. Solo se mete al compilar,
// para que las pruebas con `npm run dev` no cuenten. El token es público (va en el
// HTML). "spa": true hace que cada cambio de ruta de react-router cuente como página.
const CLOUDFLARE_ANALYTICS_TOKEN = "26f2f496175c4ca4b38041b138e73709";

function analitica(): Plugin {
  return {
    name: "cloudflare-web-analytics",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "script",
        attrs: {
          type: "module",
          src: "https://static.cloudflareinsights.com/beacon.min.js",
          "data-cf-beacon": JSON.stringify({ token: CLOUDFLARE_ANALYTICS_TOKEN, spa: true }),
        },
        injectTo: "head",
      },
    ],
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), analitica()],
  // La web se sirve en la raíz del dominio propio (venialboconecta.es).
  // Para publicar en la subruta de GitHub Pages: BASE_PATH=/venialbo-conecta/ npm run build
  base: process.env.BASE_PATH ?? "/",
  server: {
    // WSL2 + /mnt/c (filesystem Windows): inotify no detecta cambios.
    // Polling es la única manera fiable de hacer HMR en este entorno.
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
});
