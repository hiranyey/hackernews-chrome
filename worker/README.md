# Hacker News Worker

Cron-scraped replacement for the Fastify server in the repo root. The extension keeps calling `https://hn.hiranyey.dev/v2`. This Worker does not fetch Hacker News on the request path; a Cron Trigger refreshes a KV cache every two minutes.

The Fastify server (`index.ts`), its Dockerfile, and `.github/workflows/docker-image.yml` stay as the fallback.

## API

| Path | Body |
| --- | --- |
| `GET /` | HTML-escaped JSON array (extension versions before 1.6 insert fields with `innerHTML`) |
| `GET /v2` | Raw JSON array |
| `GET /health` | `{ "timestamp": "<ISO-8601>", "stories": <count> }` |

Each story is `{ "id", "title", "url", "points", "user", "comment" }`, all strings. Relative links such as `item?id=123` are resolved against `https://news.ycombinator.com/`. `javascript:` and other non-http(s) URLs become `""`. Job posts, which have no `.subline`, keep empty `points`, `user`, and `comment`.

`/` and `/v2` send `Access-Control-Allow-Origin: *`, `Content-Type: application/json; charset=utf-8`, and `Cache-Control: public, max-age=60`. Before the first successful scrape both return `503` with `Retry-After: 10` and `{ "error": "Stories not loaded yet" }`. A page with zero stories does not overwrite the last good copy.

`/` escapes `& < > " '` as `&amp; &lt; &gt; &quot; &#39;`, matching `escape-html`.

## KV

Binding name: **`HN_KV`**.

| Key | Value |
| --- | --- |
| `raw` | `JSON.stringify` of the story array |
| `escaped` | Same array with every field HTML-escaped |
| `meta` | `{ "timestamp": "<ISO-8601>", "stories": <count> }` |

`wrangler.jsonc` has a placeholder namespace id (`00000000000000000000000000000000`). Replace it before deploying.

## Runtime settings

- `compatibility_date`: `2026-10-29`
- `compatibility_flags`: `["nodejs_compat"]` (set in Wrangler config; the bundle does not import Node built-ins)
- Cron: `*/2 * * * *` (every 2 minutes, UTC)

Workers Logs and traces are enabled in `wrangler.jsonc` (`observability.logs` and `observability.traces`, both sampled at 1). Each refresh logs JSON with a `stories` count. A zero-story page and a thrown fetch error are logged and leave KV unchanged.

## Build

From `worker/`:

```sh
npm install
npm run build
```

`npm run build` writes `dist/worker.js` (esbuild bundles `src/index.ts` into one ES module). Upload that file. It has no `import` statements and no npm packages. The default export is `{ fetch, scheduled }`.

```sh
npm test
npm run typecheck
```

Tests check the HTMLRewriter parser and escaper against the cheerio loop in the root `index.ts`, using `fixtures/frontpage.html` (a saved front page, including a Launch HN relative link) and `fixtures/edge-cases.html` (a job post taken from `/jobs`, an Ask HN relative link, and non-http URLs). Regenerate the cheerio oracle with `npm run fixtures`.

## Deploy with Wrangler

1. Create the namespace and paste the id into `kv_namespaces` in `wrangler.jsonc`:

   ```sh
   npx wrangler kv namespace create HN_KV
   ```

2. Deploy. This publishes the Worker, the `HN_KV` binding, the cron trigger, and observability:

   ```sh
   npx wrangler deploy
   ```

   Cron changes can take up to 15 minutes to propagate.

3. Attach the custom domain `hn.hiranyey.dev` (the zone needs to be on the same account). Uncomment `routes` in `wrangler.jsonc`:

   ```jsonc
   "routes": [{ "pattern": "hn.hiranyey.dev", "custom_domain": true }]
   ```

   Deploy again. You can also add the domain under Workers & Pages → **hackernews-backend** → Settings → Domains & Routes.

## Upload `dist/worker.js` through the API

`PUT https://api.cloudflare.com/client/v4/accounts/<account-id>/workers/scripts/hackernews-backend` as `multipart/form-data` with a `metadata` part and the module part. Metadata the runtime needs:

```json
{
  "main_module": "worker.js",
  "compatibility_date": "2026-10-29",
  "compatibility_flags": ["nodejs_compat"],
  "bindings": [
    {
      "type": "kv_namespace",
      "name": "HN_KV",
      "namespace_id": "<KV namespace id>"
    }
  ]
}
```

Send `worker.js` as `application/javascript+module`. Cron is not in that metadata. After the script exists, register the same schedule Wrangler would:

```sh
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/hackernews-backend/schedules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '[{"cron":"*/2 * * * *"}]'
```

Then attach `hn.hiranyey.dev` in the dashboard (or with the `routes` block above, via Wrangler).

## GitHub Actions

`.github/workflows/deploy-worker.yml` runs `cloudflare/wrangler-action@v4` on pushes to `main` that touch `worker/**`. The job checks `CLOUDFLARE_API_TOKEN` and skips the deploy when the secret is unset, so forks and repos without the token stay green. Set these repository secrets before relying on it:

- `CLOUDFLARE_API_TOKEN` — Workers Scripts edit permission
- `CLOUDFLARE_ACCOUNT_ID` — optional; set it when the token can see more than one account

Replace the placeholder KV id before the first deploy or Wrangler will not bind a real namespace.
