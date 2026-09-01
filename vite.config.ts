import { defineConfig } from "vite";
import { resolve } from "node:path";

/* Two routes, one app: the board children look at, and the calendar parents keep.
   They share the data model, the symbol provider and the design tokens. */
/* A project site is served from /<repo>/, so the bundle needs that base. A build
   with no base renders an empty body and says nothing about why, which is why the
   workflow passes it rather than leaving it to a default. */
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
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
