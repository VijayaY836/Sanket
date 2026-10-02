import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build:single` produces one self-contained HTML file (used for the hosted demo).
export default defineConfig(({ mode }) => ({
  plugins: mode === "single" ? [react(), viteSingleFile()] : [react()],
  server: {
    watch: {
      usePolling: process.platform === "linux" && process.cwd().startsWith("/mnt/"),
      interval: 400,
    },
  },
  build: { outDir: mode === "single" ? "dist-single" : "dist" },
}));
