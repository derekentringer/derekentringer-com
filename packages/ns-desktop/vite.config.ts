import path from "path";
import fs from "fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const tauriConf = JSON.parse(fs.readFileSync(path.resolve(__dirname, "src-tauri/tauri.conf.json"), "utf-8"));

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(tauriConf.version),
  },
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
