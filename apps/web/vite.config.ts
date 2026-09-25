import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api/inventory": {
        target: "http://localhost:3002",
        rewrite: (path) => path.replace(/^\/api\/inventory/, "/api/v1"),
      },
      "/api/vendor": {
        target: "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/api\/vendor/, "/api/v1"),
      },
      "/api/procurement": {
        target: "http://localhost:3003",
        rewrite: (path) => path.replace(/^\/api\/procurement/, "/api/v1"),
      },
    },
  },
});
