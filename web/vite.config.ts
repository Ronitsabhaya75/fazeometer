import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API and the socket are proxied so the session cookie stays same-origin in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/socket.io": { target: "http://localhost:4000", ws: true },
    },
  },
});
