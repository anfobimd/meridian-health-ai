import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // Split shared dependencies into stable vendor chunks. Without this, every
    // lazy route chunk duplicates shadcn/radix code, and changing a single
    // page busts the browser cache for all of them. With this split:
    //   - react-vendor (React + RR)             : ~150KB, rarely changes
    //   - ui-vendor (shadcn, radix)             : ~300KB, stable
    //   - query-vendor (TanStack Query)         : ~40KB
    //   - supabase-vendor                       : ~80KB
    //   - each page chunk                       : 20-80KB, only the page's logic
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("react-router") || id.match(/[\\/]react[\\/]/)) {
            return "react-vendor";
          }
          if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("cmdk")) {
            return "ui-vendor";
          }
          if (id.includes("@tanstack")) return "query-vendor";
          if (id.includes("@supabase")) return "supabase-vendor";
          if (id.includes("date-fns")) return "date-vendor";
          if (id.includes("recharts") || id.includes("d3-")) return "chart-vendor";
          if (id.includes("pdfjs") || id.includes("react-pdf")) return "pdf-vendor";
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
}));
