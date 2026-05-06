import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxies /v1/* → http://localhost:8081/monitoring/v1/*
      "/v1": {
        target: "http://localhost:8081",
        changeOrigin: true,
        rewrite: (p) => `/monitoring${p}`,
      },
    },
  },
  build: {
    // Outputs into Spring Boot's static resources so the backend can serve the SPA
    outDir: "../src/main/resources/static",
    emptyOutDir: true,
  },
});
