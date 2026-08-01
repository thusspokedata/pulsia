import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// El backend Hono corre en :8787 en dev. Se proxean las rutas de API para trabajar same-origin
// sin CORS (y para que la cookie de sesión funcione igual que en prod).
const API_PREFIXES = ["/auth", "/cardio", "/sessions", "/metrics", "/health"];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  server: {
    proxy: Object.fromEntries(
      API_PREFIXES.map((p) => [p, { target: "http://localhost:8787", changeOrigin: true }]),
    ),
  },
});
