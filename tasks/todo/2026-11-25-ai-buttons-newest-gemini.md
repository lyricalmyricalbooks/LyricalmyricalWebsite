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
