import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: "src/webview",
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src/webview"),
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    warmup: {
      clientFiles: ["./main.tsx", "./App.tsx"],
    },
    proxy: {
      "^/rpc/": "http://localhost:5733",
      "^/events$": { target: "ws://localhost:5733", ws: true },
      "^/health$": "http://localhost:5733",
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "lucide-react",
      "diff2html",
      "cmdk",
      "zustand",
      "lowlight",
    ],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/webview"),
    emptyOutDir: true,
  },
});
