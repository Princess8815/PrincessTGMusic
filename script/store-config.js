// Public endpoints only. Preview, localhost and legacy GitHub Pages remain sandbox.
export const STORE_WORKER_URL = globalThis.location?.origin === "https://princesstgcreations.pages.dev"
 ? "https://princesstg-cd-store-live.transgirl1991.workers.dev"
 : "https://princesstg-cd-store.transgirl1991.workers.dev";
