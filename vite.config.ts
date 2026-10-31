import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Port 1420 is what Tauri expects during `tauri dev` (see src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  // Agent worktrees are checked out under .claude/, and their copies of the
  // suite must not be counted as this tree's.
  test: { exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"] },
});
