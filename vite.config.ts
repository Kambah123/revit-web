import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server is reached through a proxied preview host, so allow any host.
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    host: "0.0.0.0",
  },
  preview: {
    allowedHosts: true,
    host: "0.0.0.0",
  },
});
