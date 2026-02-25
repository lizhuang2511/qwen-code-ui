import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// eslint-disable-next-line no-undef
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // eslint-disable-next-line no-undef
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    emptyOutDir: false,
    sourcemap: false, // Disable source maps for production
    minify: "esbuild", // Ensure minification
    rollupOptions: {
      external: [],
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (
              id.includes("react") ||
              id.includes("react-dom") ||
              id.includes("react-router-dom")
            ) {
              return "react-vendor";
            }
            if (id.includes("pdfjs-dist") || id.includes("react-pdf")) {
              return "pdf-vendor";
            }
            if (
              id.includes("codemirror") ||
              id.includes("@uiw/react-codemirror") ||
              id.includes("shiki") ||
              id.includes("highlight.js")
            ) {
              return "editor-vendor";
            }
            if (id.includes("lucide-react")) {
              return "icon-vendor";
            }
            // Group other dependencies into a single vendor chunk to reduce file count
            return "vendor";
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
  define: {
    // eslint-disable-next-line no-undef
    __WEB__: JSON.stringify(process.env.GEMINI_CLI_DESKTOP_WEB === "true"),
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    proxy: {
      "/api": {
        target: "http://localhost:1858",
        changeOrigin: true,
      },
      "/api/ws": {
        target: "ws://localhost:1858",
        changeOrigin: true,
        ws: true,
      },
    },
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
});
