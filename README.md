# Hacker News new tab

The Chrome extension is in `extension/`. It reads `https://hn.hiranyey.dev/v2`.

`index.ts` is the Fastify server that can keep running on a VM as a fallback. The Cloudflare Worker in [`worker/`](worker/README.md) serves the same API and is what that hostname should point at.
