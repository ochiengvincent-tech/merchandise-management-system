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
      "/api/receiving": {
        target: "http://localhost:3004",
        rewrite: (path) => path.replace(/^\/api\/receiving/, "/api/v1"),
      },
      "/api/retail-sales": {
        target: "http://localhost:3006",
        rewrite: (path) => path.replace(/^\/api\/retail-sales/, "/api/v1"),
      },
      "/api/sales-audit": {
        target: "http://localhost:3007",
        rewrite: (path) => path.replace(/^\/api\/sales-audit/, "/api/v1"),
      },
      "/api/warehouse-operations": {
        target: "http://localhost:3005",
        rewrite: (path) => path.replace(/^\/api\/warehouse-operations/, "/api/v1"),
      },
    },
  },
});
