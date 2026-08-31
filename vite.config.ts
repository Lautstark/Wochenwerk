import { defineConfig } from "vite";
import { resolve } from "node:path";

/* Two routes, one app: the board children look at, and the calendar parents keep.
   They share the data model, the symbol provider and the design tokens. */
export default defineConfig({
  server: { host: "127.0.0.1", port: 3000, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        board: resolve(import.meta.dirname, "index.html"),
        kalender: resolve(import.meta.dirname, "kalender.html"),
      },
    },
  },
});
