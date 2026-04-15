import path from "path";
import { execSync } from "child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

let appVersion = "0.0.0";
try {
  // Ensure tags are available (Railway shallow clones may lack them)
  execSync("git fetch --tags --quiet 2>/dev/null || true", { stdio: "ignore" });
  appVersion = execSync("git describe --tags --abbrev=0").toString().trim().replace(/^v/, "");
} catch { /* fallback to 0.0.0 */ }

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
