import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
