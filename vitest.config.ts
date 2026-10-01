import { vitestConfig } from "@lautstark/toolchain/vitest";

/* The logic worth testing is the part with no DOM in it: how a week is laid out,
   which dates a pattern covers, what a series reaches. `fake-indexeddb` lets the
   store be tested the same way, because that is where the reaching happens. The
   node environment and the restored mocks are @lautstark/toolchain's. */
export default vitestConfig({ setupFiles: ["./test/setup.ts"], include: ["test/**/*.test.ts"] });
