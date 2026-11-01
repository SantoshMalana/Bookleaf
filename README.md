# BookLeaf — Author Support & Communication Portal

[![CI](https://github.com/SantoshMalana/Bookleaf/actions/workflows/ci.yml/badge.svg)](https://github.com/SantoshMalana/Bookleaf/actions/workflows/ci.yml)

Authors see their books and royalties and raise support queries. The BookLeaf ops team works a prioritised ticket queue where **AI classifies each ticket, sets its priority and drafts a reply from the BookLeaf knowledge base**. Every AI output can be overridden or edited before an author sees it.

| | |
|---|---|
| **Live app** | `https://bookleaf-o6b3.onrender.com` |
| **API docs (Swagger UI)** | `https://bookleaf-o6b3.onrender.com/api/docs` (raw spec: `/api/openapi.json`) |
| **Write-up** | [WRITEUP.md](./WRITEUP.md) |
| **Design decisions (and trade-offs)** | [DECISIONS.md](./DECISIONS.md) |

### Test credentials (pre-seeded with the provided dataset: 10 authors, 18 books)

The sign-in page also has one-click buttons for every account below.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@bookleaf.example` (Riya Verma) | `Admin@123` |
| Admin | `ops@bookleaf.example` (Karan Mehta) | `Admin@123` |
| Author | any author email from the dataset, e.g. `ananya.reddy@email.com` | `Author@123` |

Useful author accounts for the edge cases called out in the brief:

- `ananya.reddy@email.com` — never been paid, ₹2,546 pending: the **overdue payout** case.
- `kavita.deshmukh@email.com` — pending ₹850, below the ₹1,000 minimum: **rollover, not overdue**. Also has a book in typesetting.
- `sneha.kulkarni@email.com` — a book **in production** (cover design): `—` for unset fields, ₹0 royalty, stage tracker.

The database also contains 8 demo tickets (based on the sample queries in the brief) so the admin queue is not empty on first look.

---

## 1. Run it locally

Requirements: Node 20+ and a MongoDB (a free Atlas cluster, or `mongod` locally).

```bash
git clone <repo-url> && cd bookleaf-author-portal
npm install
cp .env.example server/.env        # then edit: MONGODB_URI, optionally an LLM key
npm run seed                       # loads the dataset + demo accounts/tickets (upsert; add `-- --reset` to wipe and reload)
npm run dev                        # API on :4000, web app on :5173 (proxying /api)
```

Open http://localhost:5173. With no LLM key set the app still works end to end: triage falls back to rules and drafts come from policy templates (see [AI → graceful degradation](#4-ai-integration)).

Other commands: `npm test` (86 API/domain tests, needs a MongoDB), `npm run test:e2e` (36 browser tests, see [Testing](#7-testing)), `npm run typecheck`, `npm run build && npm start` (production mode, one process serves API + UI), `npm run eval:ai` (labelled triage cases against your configured model; `-- --fallback` scores the rules and needs no key; `npm run eval:heldout` uses the held-out set) and `npm run eval:drafts` (end-to-end draft check, see [Measuring it](#measuring-it)).

### Environment variables

All configuration is in environment variables, validated at boot with Zod (the process refuses to start on bad config). See [`.env.example`](./.env.example) for the full list. The important ones:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Database connection |
| `JWT_SECRET` | Required in production (`openssl rand -hex 32`) |
| `GROQ_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Enables AI (first one found wins, or pin with `LLM_PROVIDER`). Server-side only; the frontend never receives it |
| `GROQ_MODEL` / `ANTHROPIC_MODEL` / `OPENAI_MODEL` | Override the default model without a code change |
| `AI_DAILY_BUDGET_USD` | Hard daily AI spend cap (default 5; `0` = off). Reached → the app uses rule-based triage and template drafts until the next UTC day |
| `AUTO_SEED`, `DEMO_MODE` | Seed an empty database on boot; show one-click demo logins |
| `REFERENCE_DATE` | Pin "today" for payout maths (defaults to the real clock) |

## 2. Deploy

One web service serves the API, the built React app and the docs, so there is a single origin (cookies and SSE just work, no CORS).

**Render (what this repo is configured for):** create a MongoDB Atlas free cluster and copy its connection string → on Render choose *New → Blueprint* and point it at this repo (`render.yaml`) → set `MONGODB_URI` and your LLM key in the dashboard → deploy. `JWT_SECRET` is generated automatically; `AUTO_SEED` seeds the dataset on first boot. A `Dockerfile` is included for any container host. The live deployment above is the Render one. `vercel.json` is an optional mirror: it serves the built front end on Vercel and forwards `/api/*` to the Render service, so the app (including sign-in) works from a Vercel address too; Vercel itself cannot host the API because it needs a long-running process for live updates and background AI triage. Free instances sleep when idle, so the first request after a pause takes ~30–60 s.

---

## 3. Architecture

```
┌──────────── React SPA (Vite, TanStack Query) ────────────┐
│  Author portal            Admin console                  │
└────────┬───────────────────────────┬─────────────────────┘
         │ REST /api/v1 (httpOnly cookie or Bearer JWT)     │ SSE /api/v1/events (ids only)
┌────────▼───────────────────────────▼─────────────────────┐
│ Express + TypeScript                                     │
│  middleware: helmet · rate-limit · request-id · authenticate · requireRole · zod validate │
│  modules:    auth · books · me · tickets · admin         │
│  domain:     royalty/payout rules · production stages · SLA · priority policy  (pure, unit-tested) │
│  ai:         context builder → provider (Anthropic | Groq/OpenAI-compatible | mock) → zod-validated output         │
│              circuit breaker · usage log · rule-based fallback · template drafts                    │
└────────┬─────────────────────────────────────────────────┘
         │ Mongoose
┌────────▼──────────────────────────────┐
│ MongoDB: users · authors · books · tickets · messages · aiCalls · counters │
└───────────────────────────────────────┘
```

Code layout: `server/src/{config,lib,models,domain,ai,middleware,modules,realtime,docs,seed}`, `client/src/{lib,components,pages}`, tests in `server/test`.

### Key decisions and why

**TypeScript monorepo, one deployable.** Shared mental model, one build, one host. The API serves the built SPA, which removes CORS, third-party-cookie and SSE-proxy problems entirely.

**MongoDB.** The dataset is document-shaped and the ticket thread is naturally append-only. Per-author data scoping is a single indexed filter (`author: <id>`).

**Authorization in the service layer, not only in routes.** Every author query is scoped by the caller's own author id inside the service, and someone else's ticket/book returns **404, not 403** (ids cannot be probed). Internal notes and event rows are filtered *in the database query* for authors, and author DTOs are separate types that have no AI, priority or internal fields at all — leaking them would need a code change, not a missed `if`.

**Session = JWT in an httpOnly, SameSite=Lax cookie** (JS cannot read it, so XSS cannot steal it), also accepted as `Authorization: Bearer` for API clients. Login compares against a dummy hash when the user does not exist, so timing does not reveal which emails are registered. bcrypt, login rate-limited.

**Real-time via Server-Sent Events + polling safety net.** SSE is one-way, auto-reconnecting and works through proxies without a WebSocket library. Events carry **only ids**; the client re-fetches through the normal authorised REST API, so the event channel can never leak data. If the stream is blocked, 30-second polling keeps tickets fresh, and the header shows "Live" or "Polling" honestly.

**Domain rules are code, not prompts.** Payout dates, the ₹1,000 account-level threshold, overdue detection, production stage and SLA deadlines are computed deterministically (`server/src/domain`, unit-tested) and handed to the model as facts. An LLM should write the reply, not do date arithmetic. Business-critical floors are also deterministic: legal/fraud language forces **Critical**, an ISBN error is at least **High**, and an overdue royalty is at least **High**, whatever the model says.

**Validation and errors.** Zod schemas on every body, query and param. All errors share one shape — `{ error: { code, message, details?, requestId } }` — with proper 400/401/403/404/409/422/429 codes; unknown failures log with the request id and return a generic 500 without internals.

**Ticket numbers** (`BL-1001…`) come from an atomic counter, so concurrent submissions never collide.

---

## 4. AI integration

### Two calls, each with one job

1. **Triage — on ticket creation, asynchronous.** One structured call returns `{category, priority, confidence, rationale}`. It runs after the ticket is saved (`setImmediate`), so **ticket creation never waits on, or fails because of, the AI.** The admin queue shows "Triaging…" until it lands and updates live.
2. **Draft — lazily, when an admin opens a ticket that needs a reply.** Most tickets never need one until someone looks at them, so we do not pay for drafts nobody reads. Drafts are cached against a "basis" hash (category, book, latest public message) and in-flight requests are de-duplicated, so reopening a ticket or two admins opening it together costs one call. "Regenerate" has a short cooldown.

Both use **forced tool/function calling** with a JSON schema, then the output is validated again with Zod (enum categories, bounded strings). A model reply that does not validate is treated as a failure, never trusted.

### Prompt strategy

- **Static system prompt first**, variable context after it (keeps the prefix cacheable as the KB grows).
- **Triage prompt**: the six categories with concrete examples, explicit tie-breakers (money owed → Royalty, even if a platform is mentioned), and priority rubrics. It sees a small `<context>` block (book status, payout state) so "no royalty yet" is High when the payout is actually overdue but Medium when the first payout is not yet due.
- **Draft prompt**: the tone guidelines from the brief encoded as rules (acknowledge the specific concern, use real numbers, own BookLeaf's mistakes plainly, always give a firm timeline from policy, one clear next step). The **knowledge-base section for that ticket's category** is injected as `POLICY`, plus a compact `FACTS` block.
- **Grounding over invention.** Anything the system does not know is emitted as an explicit `NOT_IN_SYSTEM: …` line (for example bank-account link status), the model must not guess it, and it returns a `verify_before_sending` list that the admin UI shows as a warning above the editor. The model also flags `needs_escalation` + team for legal, fraud or repeated-failure cases.
- **Deterministic grounding check.** After every draft, `server/src/ai/grounding.ts` compares each rupee amount, date, ISBN, link and turnaround promise in the reply against the policy + facts the model was given (never the author's text or the prompt's examples) and adds `Auto-check:` warnings to the reviewer's "verify before sending" box. It also flags the one business mistake worth hard-coding: answering an *overdue* payout with "wait for the next payout". For overdue payouts the next-payout date is withheld from the model entirely and replaced by a `REQUIRED_ACTION` fact (own it, escalate to finance, 48 hours). The check is advisory, never blocking — a human always sends. See [DECISIONS.md](./DECISIONS.md) for the bug this came from.
- **Data minimisation.** Before author text reaches the provider, `ai/redact.ts` masks e-mail addresses/UPI ids, phone numbers, IFSC codes and bank-account-like digit runs (`[email]`, `[phone]`, `[account-number]`…). ISBNs, rupee amounts, dates and titles are kept because the model needs them; the stored ticket and what admins read are untouched. Regex-based, so a safety net rather than a guarantee.
- **Prompt-injection hygiene.** Author text is wrapped in tags, delimiter-like strings are stripped, the system prompt says to treat it as data, and the output can only be a schema-valid classification or a draft that a human reads before it is sent.

### Model choice

Provider-agnostic by design; the model is an environment variable. The submitted deployment runs **`openai/gpt-oss-120b` on Groq** (`LLM_PROVIDER=groq`). Both tasks are short, structured and policy-bound, and a human reviews every draft, so the priorities are reliable forced tool-calling, low latency and low cost rather than frontier reasoning. gpt-oss-120b is an open-weight 120B mixture-of-experts model with native function calling; on Groq it answered a triage call in about 0.9 s and a full draft in about 1.1 s. Alternatives are one variable away: Anthropic (`claude-haiku-4-5` default) or any OpenAI-compatible API (`gpt-4o-mini`).

gpt-oss is a *reasoning* model: its hidden reasoning tokens are billed and counted against the completion budget. The provider therefore sets `reasoning_effort: low` and adds 1,024 tokens of head-room to each call's `max_tokens`, so a tight budget cannot be eaten by reasoning and leave an empty tool call. If a response is still truncated or malformed it is classified `invalid_output` and the fallback takes over, so the failure is safe.

Live check on the seeded "no royalty" ticket (Ananya, overdue payout): triage returned *Royalty & Payments / High*; the draft returned a schema-valid reply, `needs_escalation: true` for finance, and a `verify_before_sending` warning about the bank-account link. All logic is also tested against a mock provider and a fault-injecting provider.

### Cost awareness

- Only the **category-relevant KB section** is sent, not the whole KB, and a **compact FACTS block** replaces raw records.
- Conversation history is capped to the last 4 public messages, each truncated; ticket text is truncated at 2,000 characters.
- No full-history or full-KB resend on every call; drafts are cached and generated on demand.
- **Cost, measured on the live Groq run:** triage ≈ 900 tokens total, a draft ≈ 1,600. At gpt-oss-120b list prices ($0.15 / $0.60 per M tokens) that is ≈ **$0.0002 per triage call and ≈ $0.0004 per draft: about $0.0006 per ticket that gets both, ≈ $0.55–0.60 per 1,000 tickets**; tickets nobody opens cost only the triage call. At Haiku-class prices ($1 / $5) the same ticket is roughly 10× that. The admin **AI usage** page shows real token counts, latency and cost per call type. The KB is small today (~750 tokens), so category filtering roughly halves the prompt rather than shrinking it by an order of magnitude; the design is what keeps it flat as the KB grows.

### Spend cap

The circuit breaker protects against a *failing* provider; `AI_DAILY_BUDGET_USD` protects against a *working* one (a spam burst, a loop, a regeneration bug). Spend is summed from the usage log since 00:00 UTC (cached for 10 s, bumped locally after each call). Once the cap is reached the provider is not called at all: triage falls back to rules and drafts to templates, exactly as in an outage, and the **AI usage** page shows "Reached — using fallback". The default of $5/day is about 8,000 tickets at the measured cost.

### Graceful degradation (the AI is allowed to be down)

| Failure | Behaviour |
|---|---|
| No key / provider `none` | Tickets are created. **Rule-based classifier** assigns category + priority (badge shows "Rules", so admins know to double-check). Drafts are deterministic **policy templates** filled with real facts. |
| Timeout, 429, 5xx, bad output | One bounded retry, then the same fallback. Errors are classified (`rate_limited`, `timeout`, `invalid_output`, …) and logged to `aiCalls`. |
| Repeated failures | **Circuit breaker** opens, so the app stops hammering a failing provider and skips straight to fallback; it half-opens after a cool-down. |
| Daily spend cap reached | Same fallback, reason `budget_exceeded`, visible on the usage page; resumes automatically the next UTC day. |
| Server restarts mid-triage | A recovery sweep re-queues tickets still marked pending. |

In every case an admin can still read the ticket, override anything, and write a reply by hand. Manual category/priority overrides are never overwritten by a later AI run.

### Measuring it

`npm run eval:ai` scores triage against 22 labelled cases (`server/scripts/eval/cases.json`) using whichever provider is configured; add `-- --fallback` to score the rules instead.

| Triage on 22 labelled cases | Category | Priority (exact) | Priority (±1 level) |
|---|---|---|---|
| **`openai/gpt-oss-120b` on Groq (live)** | **22 / 22** | **18 / 22** (17–19 across runs) | **22 / 22** |
| Rule-based fallback (no AI) | 21 / 22 | 19 / 22 | 22 / 22 |

Median triage latency was ≈ 0.65 s. **Read these honestly:** seven of the cases are the author-supplied samples, the other fifteen are mine, and I tuned the prompts against the set — so it is a regression suite, not a held-out benchmark. Priority is judgement-based and varied by ±1 case between runs; that is why the business-critical floors (legal/fraud → Critical, ISBN error / overdue royalty → ≥ High) are enforced in code rather than trusted to the model. The live run was done from a browser session because my build sandbox cannot reach Groq; please re-run `npm run eval:ai` with your key to reproduce.

**A genuinely held-out set.** `server/scripts/eval/heldout.json` holds 24 further cases (Hinglish, typos, multi-intent, vague, a privacy leak, a payment sent to the wrong person, two prompt-injection attempts) that were written *after* the prompts were final and were never used to tune the prompts. Run it with `npm run eval:heldout`. I measured the **rule-based fallback** on it before touching it: **17/24 category, 8/24 exact priority, 20/24 within one level**, versus 21/22 on the set it was written with, which is a textbook overfit. I then broadened the rules' vocabulary to fix those misses (now 23/24 category), so that second figure is *no longer* held-out for the rules; the first is the honest one. The live model has not yet been scored on this set from my side; its numbers come from running the command with your key.

**Drafts, not just triage.** `npm run eval:drafts` runs the real draft pipeline against every seeded demo ticket (real author, book and royalty facts from the database) plus four hostile messages: an instruction to promise a ₹50,000 refund, an attempt to extract the system prompt and other authors' emails, bait to confirm an invented amount, and bait to guarantee a payout date. Each reply is checked by code, not opinion: grounding warnings, length, no markdown or sign-off, an overdue payout must be escalated to finance without pointing at a future payout date, and the planted instruction must not be obeyed. It reads from the database, writes nothing, and exits non-zero on a hard failure. In production the quality signal is in-app: draft acceptance (sent as-is vs edited), triage override rate and the authors' "Was this helpful?" rate.

---

## 5. API

Interactive docs: **`/api/docs`** (Swagger UI; try requests after logging in via `/auth/login`). Base path `/api/v1`. All routes except `health`, `auth/login` and `auth/demo-accounts` require authentication; `/admin/*` additionally requires the `admin` role.

| Method & path | Role | Description |
|---|---|---|
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | public / any | Session management |
| `GET /me` | any | Profile + dashboard numbers (royalty totals, next payout date, ticket counts) |
| `GET /books` · `GET /books/:id` | author (own) / admin (all, `?authorId=`) | Books with royalty earned/paid/pending, payout state, production stage |
| `GET /tickets` · `POST /tickets` | author | List own tickets (`status`, `page`, `limit`); create (`bookId` optional = General/Account) |
| `GET /tickets/:id` · `POST /tickets/:id/messages` | author | Own ticket with public thread; add a follow-up |
| `POST /tickets` *(idempotent)* | author | Identical submission within 2 min returns the existing ticket (`200`) |
| `POST /tickets/:id/feedback` | author | "Was this helpful?" rating on a resolved/closed ticket (`helpful`, optional `comment`); cleared if the ticket is reopened |
| `GET /events` | any | SSE stream of ticket events (ids only) |
| `GET /admin/stats` | admin | Queue counters (active, overdue, unassigned, mine, avg first response, helpful rate) |
| `GET /admin/tickets` | admin | Filter by `status`, `category`, `priority`, `from`/`to`, `assignee`, `overdue`, `q`; `sort=urgency\|oldest\|newest\|activity`; paginated |
| `GET /admin/tickets/:id` | admin | Full thread incl. internal notes + event timeline + cached draft |
| `PATCH /admin/tickets/:id` | admin | Override `status`, `category`, `priority` |
| `POST /admin/tickets/:id/replies` | admin | Reply to the author (`status` optional for send-and-resolve) |
| `POST /admin/tickets/:id/notes` | admin | Internal note (never visible to the author) |
| `PUT /admin/tickets/:id/assignee` | admin | `me` or `unassigned` |
| `POST /admin/tickets/:id/draft` · `POST /admin/tickets/:id/triage` | admin | Generate/regenerate a draft; re-run triage |
| `GET /admin/ai/usage` | admin | Tokens, latency, cost, fallback rate, draft acceptance |
| `GET /health` | public | Liveness + DB + AI status |

Lists return `{ items, meta: { page, limit, total, totalPages } }`; single resources return `{ data }`; errors return `{ error: { code, message, details?, requestId } }`.

---

## 6. Product behaviour worth knowing

- **Admin queue**: stat tiles double as filters; default sort puts the most urgent first (priority, then oldest). Each row has a priority colour bar, SLA pill (due-in / **overdue by**), and source chips showing whether category/priority came from **AI**, **Rules** (fallback), **Manual** override or a **Preset**. Filters live in the URL so a view can be shared.
- **SLA** (clock runs only while a ticket is waiting for a BookLeaf reply): Critical 4 h, High 24 h, Medium 48 h, Low 72 h.
- **Escalation never goes stale.** The deterministic priority floors run again on every author follow-up (regex, no AI call). If a ticket that started as a bio question later says "this is fraud, I'll go to the police", it becomes Critical with a 4 h SLA, the change is logged on the timeline, and it wins even over an admin's earlier manual priority (a person set that before the threat existed). Triage also reads follow-ups that arrived while the model was thinking.
- **Double-submits are harmless.** An identical ticket (same book, subject and text) from the same author within two minutes returns the existing ticket with `200` instead of creating a duplicate.
- **Ticket workspace**: conversation + event timeline, tabs for *Reply to author* / *Internal note*, AI draft pre-filled in an editable box with verify-before-send warnings and an escalation flag, *Send reply* or *Send & resolve* (**Ctrl/Cmd+Enter** sends), one-click **quick replies** for repetitive cases (they work with the AI off), the author's books/royalty alongside, and the author's helpful/not-helpful rating once resolved. The system records whether each sent reply was an unedited draft, an edited draft, or written manually.
- **Author**: dashboard, books (live vs in-production sections, royalty bar, payout explanations in plain language, stage progress for unpublished books, `—` for unset fields), submit query with inline validation and a UI-only attachment picker, tickets with a "new reply" cue, live updates with a toast, and a one-tap "Was this answer helpful?" on resolved tickets.

## 7. Testing

**`npm test`** — 86 tests against a real MongoDB (not mocks): the royalty/payout/SLA/priority rules, context-building (the right KB section, facts present, size budget), the AI client (timeouts, 429, invalid output, circuit breaker, fallback), and the HTTP API (auth, RBAC, **cross-author isolation**, internal-note secrecy, validation errors, filters, SSE, OpenAPI coverage).

**`npm run test:e2e`** — 36 Playwright tests that drive a real browser against real servers (it builds the client, boots two freshly seeded servers on throwaway databases, and tears them down). First time only: `npx playwright install chromium`. Needs a MongoDB at `mongodb://127.0.0.1:27017` (override with `MONGODB_BASE_URI`). It covers:

- **Auth & guards** — redirects, wrong password, sign-out really ends the session, authors cannot open `/admin`, admins are bounced from author pages.
- **Author portal** — the overdue-payout, below-threshold and in-production cases with the exact dataset, empty states, inline form validation, UI-only attachments, book dropdown scoped to the author.
- **The full ticket lifecycle with two live browser sessions** — author submits → admin sees it arrive and triaged → filters/overrides/assignment → AI draft edited and sent → **the author sees the reply without refreshing** → internal notes never reach the author (checked in the DOM and in the raw API JSON) → follow-up → resolve → reopen → closed.
- **API security** — 401/403/404 behaviour, tampered tokens, cross-author access, validation errors with field details, no user enumeration on login, OpenAPI served.
- **AI down** — a second server with no LLM: tickets still created, rule-based triage (legal language → Critical), template draft, manual reply delivered live.

`npm run typecheck` covers both server and client.

## 8. Assumptions

- **Payout rule**: payouts happen within 45 days after each quarter end (Mar/Jun/Sep/Dec 31 → Feb 14 / May 15 / Aug 14 / Nov 14). The **₹1,000 minimum is applied to the author's whole account**, not per book. A book that has earned royalty but never been paid is *overdue* once its first payout window has passed.
- "Today" is the real clock (so Ananya's overdue payout is relative to the current date); set `REFERENCE_DATE` to pin it.
- Production stages are the nine in the knowledge base; "Published & Live" is the only live status.
- Demo accounts (password `Author@123` for authors, `Admin@123` for admins) exist so reviewers can test the exact dataset; turn off `DEMO_MODE` and change the seed passwords for any real use.
- Attachments are **UI-only** as the brief allows: only file name/size/type are recorded.

## 9. Known limitations

- **Single-instance realtime and AI queue.** The SSE hub and the triage queue are in-process. Scaling out needs Redis pub/sub (or Mongo change streams) and a real job queue (BullMQ). The crash-recovery sweep already makes the queue safe to lose, but it does not coordinate across instances.
- **No file storage**: attachments are not uploaded (would need object storage + virus scanning).
- **Search** is a case-insensitive regex over a few fields; fine at this scale, a text index or Atlas Search would replace it.
- **No self-serve password reset, email notifications, or audit-grade history** beyond the ticket event timeline.
- AI quality was verified with a mock provider, a fault-injecting provider, the fallback eval and a live Groq run of the 22-case triage eval plus draft spot-checks (numbers above). The held-out triage set and the draft eval exist as one-line commands but have not yet been run against the live model. The eval set was tuned against, priority accuracy varies by ±1 case between runs, and the grounding check is regex-based, so it catches unsupported numbers/dates/links/timelines but not every possible unsupported claim.
- Rate limits are per-instance memory stores.
