// vite.config.ts
// Temporarily disable lovable-tagger for debugging

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
// import { componentTagger } from "lovable-tagger"; // Temporarily comment out

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    // Temporarily disable the tagger plugin
    // mode === 'development' &&
    // componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));