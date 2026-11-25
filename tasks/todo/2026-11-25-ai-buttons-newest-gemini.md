# Fix Describe with AI (and every AI button), 25 November 2026

Reproduced live in the admin (The Hound › Media › Describe with AI, and SEO › Write with AI): the server answered
502/429, "Google's AI service is busy … OpenRouter is limiting requests". Both providers asked for Gemini 2.5 Flash first
(retiring 1 Dec 2026, OpenRouter lists it with that expiry date); Gemini's `generate` stopped on the first 5xx and never
tried the next model, and OpenRouter's default list only moved on for a 404.

- [x] Gemini: newest Flash first (`gemini-flash-latest`, `gemini-3.6-flash`, `gemini-2.5-flash`); move on for 404/429/5xx
      (not for a refused key or a timeout); thinking set by level on Gemini 3+, asked again without it if refused.
- [x] OpenRouter default: `~google/gemini-flash-latest`, `google/gemini-3.6-flash`, `openai/gpt-4o-mini`; move on for
      404/429/5xx only when the owner chose no model; `~` allowed in model names (server and admin); short reasoning.
- [x] Server logs each upstream failure (model, status, message) so the next problem shows in the Functions logs.
- [x] Tests: the reported bug (photo described when the first model is down), 5xx/429 fallback, thinking retry, no
      fallback for a bad key or timeout.
- [ ] CI green, merge, then press Describe with AI on the live admin after Deploy Firebase.

## Review
Root cause was a stale, hard-coded model list plus a fallback that only handled retired (404) models.

## Round 2 (PR #918 live, still failing)
Live calls with the shop's own key: `gemini-2.5-flash` 404 "no longer available to new users"; `gemini-flash-latest`,
3.5/3.6/3.7/3.8 Flash 503 "high demand" or hung 30–40 s (the 25 s timeout then ended the request, never trying another
model); `gemini-flash-lite-latest` (→ 3.5 Flash-Lite) 200 in 1–3 s, photo alt text included. OpenRouter key is free tier
($0 limit) with `google/gemma-4-31b-it:free` chosen, which is rate limited (429), so it can't cover for Google.
- [x] Flash-Lite first: `gemini-flash-lite-latest`, `gemini-3.5-flash-lite`, then `gemini-flash-latest`, `gemini-3.8-flash`.
- [x] 15 s per model; a timeout moves on to the next model (still within the 30 s new-try cap).
- [ ] Verify Describe with AI and Write with AI on the live admin after Deploy Firebase.
