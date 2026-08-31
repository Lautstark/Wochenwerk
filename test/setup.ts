import "fake-indexeddb/auto";

/* The store keys records by UUID and the node build has no WebCrypto UUID before
   19; this is only here so a test can create records the way the browser does. */
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: { ...globalThis.crypto, randomUUID: () => `${Math.random().toString(16).slice(2)}-test` },
  });
}
