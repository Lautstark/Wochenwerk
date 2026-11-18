import { describe, expect, it, vi } from "vitest";
import { entryOf, look, watchVersion } from "../src/fresh.js";

const page = (bundle: string) => `<!doctype html><html><head><script>(function(){})();</script>
<script type="module" crossorigin src="${bundle}"></script><link rel="modulepreload" crossorigin href="/assets/x.js"></head><body></body></html>`;

describe("which bundle a page loads", () => {
  it("is the module script's src, whatever order the attributes come in", () => {
    expect(entryOf(page("/assets/main-AbC123.js"))).toBe("/assets/main-AbC123.js");
    expect(entryOf(`<script src="/assets/b.js" type="module"></script>`)).toBe("/assets/b.js");
  });
  it("is nothing where there is no module script, and the inline watchdog is not one", () => {
    expect(entryOf(`<script>var a = 1;</script>`)).toBeNull();
  });
});

describe("a look at the deployed page", () => {
  const watch = (deployed: string | null, quiet = true) => {
    const reload = vi.fn();
    return { reload, run: () => look({ running: "/assets/main-old.js", quiet: () => quiet, reload,
      fetchPage: async () => deployed === null ? null : page(deployed) }) };
  };
  it("leaves the same version alone", async () => {
    const { reload, run } = watch("/assets/main-old.js");
    expect(await run()).toBe("same");
    expect(reload).not.toHaveBeenCalled();
  });
  it("reloads into a new version when nothing is happening", async () => {
    const { reload, run } = watch("/assets/main-new.js");
    expect(await run()).toBe("reloaded");
    expect(reload).toHaveBeenCalledOnce();
  });
  it("waits while something is happening", async () => {
    const { reload, run } = watch("/assets/main-new.js", false);
    expect(await run()).toBe("waiting");
    expect(reload).not.toHaveBeenCalled();
  });
  it("treats no answer as no news", async () => {
    const { reload, run } = watch(null);
    expect(await run()).toBe("same");
    const failing = await look({ running: "/assets/main-old.js", quiet: () => true, reload,
      fetchPage: () => Promise.reject(new Error("offline")) });
    expect(failing).toBe("same");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("the watch", () => {
  it("asks again soon while it waits, and stops once it reloaded", async () => {
    const waits: number[] = [];
    const queue: (() => void)[] = [];
    let quiet = false;
    const reload = vi.fn();
    watchVersion({ running: "/assets/main-old.js", quiet: () => quiet, reload, every: 600, retry: 30,
      fetchPage: async () => page("/assets/main-new.js"),
      later: (run, ms) => { waits.push(ms); queue.push(run); } });
    const step = async () => { queue.shift()!(); await new Promise(done => setTimeout(done)); };
    await step();
    quiet = true;
    await step();
    expect(waits).toEqual([600, 30]);
    expect(reload).toHaveBeenCalledOnce();
    expect(queue).toHaveLength(0);
  });
});
