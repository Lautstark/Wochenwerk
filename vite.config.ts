import { defineConfig } from "vite";
import { piperVendor } from "@lautstark/stimmquelle/vite";
import { resolve } from "node:path";

/* Two routes, one app: the board children look at, and the calendar parents keep.
   They share the data model, the symbol provider and the design tokens. */
/* A project site is served from /<repo>/, so the bundle needs that base. A build
   with no base renders an empty body and says nothing about why, which is why the
   workflow passes it rather than leaving it to a default. */
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  /* piper's phonemizer and onnxruntime's binaries, put where the page can fetch
     them. Only the single-threaded pair, which is the plugin's default: the
     threaded ones are asked for on a cross-origin-isolated page, and a project
     site sends none of the headers that make one. `dir` matches what
     `piperRuntime` is given in src/speech.ts. */
  plugins: [piperVendor({ dir: "wasm" })],
  server: { host: "127.0.0.1", port: 3000, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        board: resolve(import.meta.dirname, "index.html"),
        /* A directory rather than a page, so the address is `/kalender` and not
           `/kalender.html`. Pages serves a directory's index and redirects the
           bare name onto it; Vite mirrors the source path into the output, so
           moving the file is the whole change. */
        kalender: resolve(import.meta.dirname, "kalender/index.html"),
      },
    },
  },
});
