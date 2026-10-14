import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dev server is reached through a proxied preview host, so allow any host.
// `/api` is proxied to the AI server (server/index.mjs) so the DeepSeek key stays server-side.
const aiServer = process.env.AI_SERVER_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
  server: {
    allowedHosts: true,
    host: "0.0.0.0",
    proxy: {
      "/api": { target: aiServer, changeOrigin: true },
    },
  },
  preview: {
    allowedHosts: true,
    host: "0.0.0.0",
    proxy: {
      "/api": { target: aiServer, changeOrigin: true },
    },
  },
});
