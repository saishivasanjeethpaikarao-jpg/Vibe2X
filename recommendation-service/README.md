# Optional Vibe2X recommendation reranker

This stateless Cloudflare Worker accepts only compact music context and real candidate IDs, calls a configured OpenAI-compatible hosted model, validates its ranked IDs, and returns IDs only. Vibe2X still filters candidates before and after the call. The app's deterministic Smart Continue works when this service is absent, slow, or unavailable.

This service is **not deployed by the repository**. It has no user accounts or listening-history database. It does not receive the user's name, email, device ID, playback URL, or complete history. The Worker whitelists fields before forwarding to a model. Do not claim on-device-only processing when AI assistance is enabled.

## Manual secure configuration

1. Use a legally eligible account with a compatible hosted inference provider. Set the provider's **HTTPS chat-completions endpoint** and model in Cloudflare Worker secrets named `AI_PROVIDER_URL` and `AI_MODEL`; set the private provider key only in the Worker secret `AI_API_KEY`. Configure these through the Cloudflare dashboard/official secret interface. Never place a key in the app, this repository, `EXPO_PUBLIC_*`, or a build log.
2. Review the Worker rate limit, the provider's spending cap, and abuse protections before a public deployment. The included 60-request/minute binding is a basic per-edge global limit, not a billing-grade quota. Use a unique rate-limit namespace ID for your Cloudflare account. Public mobile clients cannot keep a shared secret.
3. Deploy the Worker through your authorized Cloudflare account only after its secrets and budget controls are ready. Its API route is `POST /recommend`.
4. For a QA app build that can reach it, set the **public URL only** as `EXPO_PUBLIC_RECOMMENDATION_ENDPOINT=https://<your-worker-domain>/recommend` in the build environment. The URL is public configuration, not a secret. AI assistance remains off by default and can be enabled in Settings. Builds without that URL keep deterministic recommendations and disable the AI switch.

No provider URL, model, account, or API key is fabricated here. The service does not need to be deployed for Vibe2X playback or Smart Continue.

## Local checks

From this directory: `npm ci`, `npm run check`, `npm test`, `npm run build` (dry-run only). Do not use `wrangler deploy` during QA unless the owner has configured and approved a real deployment.
