import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/* TypeScript inside components, and nothing else: no adapter, no kit, no
   routing. The board and the calendar are two static pages, and Vite already
   knows which two. */
export default { preprocess: vitePreprocess() };
