import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 3006,
    strictPort: true,
  },
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,
  // Tauri expects a fixed port
  envPrefix: ["VITE_", "TAURI_"],
});
