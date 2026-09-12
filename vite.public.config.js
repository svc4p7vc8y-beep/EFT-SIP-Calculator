import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { cpSync } from "node:fs";

const publicAssets = () => ({
  name: "eft-public-assets",
  closeBundle() {
    for (const folder of ["icons", "site-assets"]) {
      cpSync(
        resolve(import.meta.dirname, "public", folder),
        resolve(import.meta.dirname, "dist-public", folder),
        { recursive: true },
      );
    }
  },
});

export default defineConfig({
  plugins: [react(), publicAssets()],
  base: "./",
  publicDir: false,
  build: {
    outDir: "dist-public",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: true,
    rollupOptions: {
      input: {
        site: resolve(import.meta.dirname, "index.html"),
        questionnaire: resolve(
          import.meta.dirname,
          "EFT_client_questionnaire.html",
        ),
      },
    },
  },
});
