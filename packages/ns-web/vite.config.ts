import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Read version: try git tag first, fall back to package.json
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
let appVersion = pkg.version || "0.0.0";
try {
  appVersion = execSync("git describe --tags --abbrev=0").toString().trim().replace(/^v/, "");
} catch { /* git tags unavailable (e.g., Railway shallow clone) — use package.json version */ }

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 3005,
  },
});
