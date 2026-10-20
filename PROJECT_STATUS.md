# Tech Quiz Master — Project Status

## Current status

Tech Quiz Master is stable and ready for the next product-development phase.

Stabilization Steps 1–15 (audit, extraction, timer/submission fixes, regression
testing, production audit, wrap-up) are complete. All automated checks pass,
the security architecture is verified, and only documented low-severity items
remain.

### Phase 2 progress

- **Step 4 — server-side submission idempotency (implemented, verified,
  preserved).** Every secure submission carries a client-minted UUID
  `attemptId`, and the server persists **at most one `Result` per
  `(userId, attemptId)`**, enforced by a partial unique index
  (`{userId, attemptId}` with `partialFilterExpression {attemptId: {$type:"string"}}`,
  so legacy key-less rows are never constrained). Guarantees:
  - Duplicate retries of one attempt collapse to a single row and replay the
    stored record (`200 {success, result, summary, idempotent: true}`, summary
    derived from the stored document — a tampered retry cannot change it).
  - Concurrent identical requests resolve to exactly one `201` (E11000 from
    the index → fetch winner → replay; never a 500, never a second row).
  - `server.js` awaits `connectDB()` **and `Result.init()` before
    `app.listen`**, failing fast if the index cannot be built.
  - Legitimate new attempts (fresh `attemptId` at Start/Start New) stay
    distinct results; other users can never collide with or reach your rows
    (key is always scoped to the session-derived `userId`).
  - Requests **without** an `attemptId` keep pre-idempotency behavior
    (older clients unaffected); the temporary legacy client-scored branch
    intentionally drops the key and stays non-idempotent.
- **Step 5 — attempt history & performance tracking.** `GET /results/my-results`
  remains session-owned, newest-first, bare-array shaped (existing consumers
  untouched) with an optional validated `?limit=1..200`. My Result adds a
  real-data performance summary (total attempts, average, best, 3-vs-3 recent
  trend that honestly requires 6+ attempts) and a historical review dialog
  driven by the stored per-question snapshot — no new endpoint, no schema
  change, no answer keys, graceful message for legacy rows.
- **Step 6 — premium design system & user dashboard.** The light-first
  Tailwind 4 token set in `frontend/src/index.css` gained semantic accents
  (`--color-success/-warning/-danger/-info`); all class strings stay in the
  `dummyStyles (1).js` registry (new `dashboardStyles` section, stronger rail
  selected states). The Home branch of `Sidebar` now renders `DashboardHome`
  (replacing `EmptyState`): a welcome hero, a real **Continue learning**
  section derived from saved `progressByTech` records
  (`getAttemptStatus === "resumable"`) whose "Continue" action lands on the
  existing Resume Quiz / Start New Quiz start screen, and a signed-in
  **performance snapshot** computed by `summarizePerformance` from the same
  `/results/my-results` rows My Result renders (Attempts/Average/Best tiles,
  honest 3-vs-3 trend, loading, empty and error+retry states; no section at
  all when signed out). The tech rail shows a real per-tech completion pill.
  Quiz flow, results screens, attempt-id/idempotency guarantees, auth and DB
  semantics are untouched; new `dashboardFlow` harness (9 checks) covers the
  dashboard states.
- **Step 7 — premium technology selection & quiz experience.** The rail keeps
  its names/progress pills but gains hover lift and a data-driven unavailable
  state: a catalog level with zero questions renders disabled ("No questions
  yet") in the rail and on the difficulty cards and can never start. The
  difficulty screen (`TechSelectedState`) was rewritten from a placeholder
  into responsive level cards carrying real catalog counts/time pills plus
  saved answered/completed pills — its dead `selectedLevel` block was removed
  and the mobile `MobileLevelStrip` (duplicate of the same choice) was
  deleted along with its registry keys. The start screen never invents a
  time limit (the Time Limit stat hides when the catalog has none), shows a
  non-interactive sign-in note when signed out, and captions Resume vs Start
  New with what each keeps. Active-quiz polish: bordered monospaced timer
  with `Time remaining` announcement, larger touch-target question navigator
  (labels/`aria-current` unchanged), `break-words` question text, clearer
  selected-option ring (canonical `border-blue-300` kept), decorative progress
  bar hidden from assistive tech. Backend, submission payload, resume/restart
  semantics, timer behaviour and persistence format are untouched; new
  `quizExperience` harness (9 checks) covers cards, unavailable levels,
  start-screen honesty, answer/navigator/timer states and the restart dialog
  cancel/confirm.
- **Step 8 — premium results, history & answer review.** The My Result page
  and its review dialog moved onto the Step 6/7 registry: all class strings
  (including the previously inline ones) live in `resultPageStyles` /
  `reviewStyles` / the new `scoreCardTone` helper. History cards gained a
  labelled **Date / Time Taken / Started At** meta row and an accessible score
  announcement (`aria-label="… score"`); the performance summary tiles keep
  their exact structure and values but gain semantic tone classes
  (success/danger/muted — the visible labels still carry the meaning). The
  review dialog now shows a **safe completion date** (never `Invalid Date`/
  `undefined`; unparseable records read "date unavailable") plus the real
  percent next to the score, with identical Escape/focus-trap/first-focus
  behaviour and the unchanged legacy message. `formatTimeTaken` /
  `formatElapsedTime` ignore non-finite input (`NaN` impossible). The in-app
  quiz-completion screen keeps its exact headings/buttons while its score
  cards move to the shared tone helper. Scoring, ordering, snapshot security,
  timer and submission behaviour untouched; new `resultsExperience` harness
  (6 checks) covers malformed date/time safety, card metadata, summary tones,
  unanswered review labels, the real Tab focus trap and the results screen
   hierarchy/tones.

- **Step 9 — premium admin dashboard & quiz management.** The admin app's
  styling now runs entirely through its own registry (`dashboardStyles` and
  `listPageStyles` replaced, new `quizDetailStyles`; restrained slate/indigo
  palette, no custom CSS animations or per-technology gradients). The
  dashboard gained a real **Platform stats** section driven only by
  `GET /admin/stats` (loading skeleton, honest error + *Try again* retry, never
  fabricated numbers), labelled fields (`htmlFor`/`id`), `aria-pressed` level
  buttons, a keyboard-reachable dropzone, a visible toast, and an
  accidental-data-loss guard (`beforeunload` while CSV questions are loaded,
  cleared before the post-create redirect). The quiz list gained proper
  loading/error+retry/empty/filtered-no-match states, a **rendered** delete
  toast (the old one was never displayed), NaN-safe dates and missing-field
  fallbacks ("—"/"Untitled quiz"), labelled per-card actions, an accessible
  filter menu and delete dialog (focus, Escape, `aria-modal`), and View buttons
  that finally activate `/quiz/:id`. The quiz detail page was redesigned with
  loading/error+retry/back states and metadata only — question text and answer
  material are never rendered. A follow-up polish pass extended the same
  registry (`navbarStyles`, `sharedStyles`, one shared level-tone map) across
  the landing page, list cards, quiz detail and required-auth screens. The
  admin API gained additive stats (`totalQuizzes`, `totalQuestions`,
  `levelCounts`, metadata-only `recentQuizzes`) and an admin-only
  `POST /admin/quiz/:id/duplicate` that clones server-side (answer keys never
  reach the browser); admins can duplicate from the list or detail screen,
  export the catalogue to CSV, sort, and download a CSV template. The new
  landing page adds feature/how-it-works/CTA sections with Clerk modal sign-in.
  The `adminExperience` harness (9 checks) pins the exact create payload,
  endpoints (stats/list/detail/duplicate/delete), duplicate refetch and
  navigation, admin states and dialog/toast a11y. A final polish pass made the
  dashboard stat tiles compact (icon beside value), simplified the quiz cards
  to a single inline metadata strip, restyled the active-quiz screen (timer
  pill, navigator cells, option cards, question eyebrow) and fixed two admin
  bugs: CSV drops are accepted by extension when the browser reports a
  non-`text/csv` MIME type, and a successful create now navigates in-app to
  `/list` instead of forcing a full-page reload.

All 8 backend suites (149 checks) and all 8 frontend suites (93 checks) pass;
frontend lint is clean (0 errors / 2 pre-existing warnings), admin lint is
clean (0 errors / 1 warning) and both production builds succeed. See
**Testing** for the exact counts.

---

## Architecture

### Frontend (→ Vercel) — React 19 + Vite + Tailwind + Clerk

| Module | Responsibility |
|---|---|
| `components/Sidebar.jsx` | Orchestrator component: render-branch selection (empty → tech/level → start → quiz → results), catalog fetch (`GET /admin/quizzes`), cross-hook wiring via refs, login gating, review rendering. |
| `hooks/useQuizSession.js` | Session state + lifecycle: selected tech/level, start/home/restart, answer & navigation actions, per-level state restore on level select. Owns no timer or storage writes. |
| `hooks/useQuizTimer.js` | Countdown lifecycle: start/stop/restore, interval safety (single interval, unmount cleanup), `timeLeft`/`elapsedTime`/`timerStartedAt`, auto-submit trigger. |
| `hooks/useQuizPersistence.js` | localStorage writes: global progress envelope + per-level records, timer-state snapshots, save-on-change effects. |
| `hooks/useQuizSubmission.js` | Submit pipeline: confirmation → single-POST guard (`isSubmittingRef`) → `POST /results/create` → server summary/review snapshot → results state. Client never scores. |
| `utils/quizStorage.js` | Storage key, schema helpers, safe JSON parse, migration/initial-progress readers. Default per-level record includes `attemptId: null` (Step 4). |
| `utils/quizAttempt.js` | Attempt identity helpers: `createAttemptId()` (UUID v4, `randomUUID` with a `getRandomValues` fallback), `getAttemptId()` (tolerant reader for legacy records). |
| `utils/quizProgress.js` | Answered counts, first-unanswered index (used by restore/resume). |
| `utils/quizCatalog.js` | Catalog normalization (`GET /admin/quizzes` response → technologies/levels/questions/time limits). |
| `utils/performanceStatus.js` | Display bands from the **server** summary percentage. |
| `utils/performanceSummary.js` | History performance rules (Step 5): eligible-row filter, per-attempt percentage, average/best, 3-vs-3 trend with a documented 6-attempt minimum, defensive `createdAt` re-sort. |
| `utils/submissionPayload.js` | Payload contract `{quizId, answers[{questionId, selectedAnswer}], timeTaken, attemptId?}` + summary mapping; the key is only added when present so pre-Step-4 callers keep the exact legacy shape. |
| `utils/quizResults.js`, `utils/timeFormat.js` | Result normalization for My Results, `extractReviewEntries()` (authorized historical-review snapshot → `null` for legacy rows), timer formatting. |
| `components/sidebar/*` (Step 11) | Extracted presentational states: `EmptyState`, `TechSelectedState`, `ConfirmDialog`, `LoadingState`. |
| `components/AttemptReview.jsx` (Steps 5, 8) | Historical review dialog: renders a stored attempt's per-question snapshot with the live review's answer contract (your pick vs correct index), a safe completion date ("date unavailable" when unparseable) and the real percent, Escape/focus-trap/`aria-modal`, graceful message when a legacy row has no snapshot. |
| `pages/`, `Navbar`, `MyResult` | Routing (`/`, `/result`), navigation, attempt history page: loading/empty/error states, track-grouped cards (score %, correct/wrong/unattempted, labelled Date/Time Taken/Started At meta row with safe formatting, Step 8), **performance summary tiles** (Step 5, toned values Step 8) and per-card *Review answers* action. |
| `services/api/api.js` | Axios client: `VITE_API_URL`, Clerk bearer token injection, uniform error mapping. |

### Backend (→ Render) — Express 5 + Mongoose + Clerk + Svix

| Module | Responsibility |
|---|---|
| `server.js` | dotenv load, **fail-fast required-env validation** (names only), DNS config, `connectDB()`, **`await Result.init()`** (unique idempotency index proven built before serving; exits 1 by error identity only if it fails), `app.listen(PORT)`. |
| `app.js` | Production middleware order: `x-powered-by` off → trust proxy → helmet → CORS allowlist → 4 rate limiters → webhook router (raw) → Clerk auth middleware → JSON/urlencoded body caps → admin/result routes → 404 + centralized error handler. |
| `middleware/auth.js` | `protect` (Clerk session → 401) and `isAdmin` (server-side role lookup in DB → 403; never trusts client input). |
| `middleware/validation.js` | Request validation for quiz upload and result submission (400 contract). |
| `middleware/errorHandler.js` | Single JSON error contract `{success:false,message}`; status mapping (400/401/403/404/409/413/500); 500s log server-side only, never expose stack/secrets. |
| `middleware/rateLimit.js` | General / submission / admin / webhook limiters, env-tunable, JSON 429. |
| `middleware/trustProxy.js` | `TRUST_PROXY` parser (default 1 hop, refuses `true`). |
| `middleware/bodyLimit.js` | JSON/urlencoded/webhook caps, refuses invalid values at startup. |
| `middleware/httpMethods.js` | 405 handling with `Allow` header. |
| `routes/admin.js` + `controllers/adminController.js` | Catalog (public, **answerKey-stripped** via `toPublicQuiz`/`toPublicQuestion`), upload/stats/delete (`protect, isAdmin`). |
| `routes/result.js` + `controllers/resultController.js` | `POST /results/create` — **authoritative server-side scoring** against stored `answerKey`, forged client fields ignored; **idempotent per `(userId, attemptId)`** (fast-path replay → insert → E11000→replay; optional UUID `attemptId`, normalized lowercase; absent key = legacy behavior). `GET /results/my-results` — ownership from the Clerk session only (client-supplied user ids ignored), newest-first, optional validated `?limit=1..200`, bare-array shape unchanged, never exposes `answerKey` (Results store only the authorized review snapshot). |
| `routes/user.js` + `controllers/webhook.js` | Clerk webhook: `express.raw` → Svix verification → user/session upserts; admin role from configured `ADMIN_EMAIL` only. |
| `config/db.js` | Mongoose connect from `MONGODB_URI`; failure logs error **name** only and exits 1 (no credential leakage). |
| `model/*` | Quiz / User schemas unchanged. **`Result` (Step 4):** `attemptId: String` + partial unique index `{userId, attemptId}` (`unique`, `partialFilterExpression {attemptId: {$type: "string"}}`) — additive only, no migration, legacy key-less rows unaffected. |

### Admin (→ Vercel) — React + Vite + Tailwind + Clerk

| Area | Implementation |
|---|---|
| Authentication | Clerk sign-in (`ClerkProviderWithRouter`), token via `useAuth().getToken()`. |
| Quiz management | `Dashboard` (create quiz: labelled fields, `aria-pressed` levels, keyboard-reachable CSV dropzone, preview, registry-driven toasts, Step 9), `List` (search/filter with loading/error+retry/empty/no-match states, accessible delete dialog with visible feedback, View → `/quiz/:id`, Step 9), `QuizPage` (read-only detail: loading/error+retry, metadata only, Step 9). |
| Upload / delete | `POST /admin/upload-quiz`, `DELETE /admin/quiz/:id` — both require backend `protect, isAdmin`. |
| Statistics | `GET /admin/stats` (server-side counts) rendered with loading / error+retry states — only real values, Step 9. |
| Admin authorization | **Server-side only**: backend `isAdmin` checks the `role` field in MongoDB; the client never decides. |

---

## Security

Completed and verified across Steps 1–14 (tests + live smoke):

- `answerKey`/`correctAnswer` **never returned** by public quiz endpoints (stripped in controllers; frontend grep confirms comments only).
- **Server-side scoring**; forged `score`, `correctAnswers`, `totalQuestions`, `technology`, `level` fields ignored.
- Admin routes require **authentication (401)** + **server-side admin authorization (403)**.
- Clerk webhook: **raw body → Svix signature verification → controller** (`express.json()` never consumes the signed bytes); invalid signature → 400.
- Malformed input → safe 400s; oversized bodies → 413; unknown routes → JSON 404; never 500-on-bad-input.
- CORS: **allowlist only** (`FRONTEND_URL`, `ADMIN_URL`, `CORS_EXTRA_ORIGINS`), `*` dropped, credentials on; no wildcard with credentials.
- Helmet security headers on every response; `x-powered-by` hidden.
- Four rate limiters (general/submission/admin/webhook) with JSON 429 + `Retry-After`.
- Errors/logs never expose stack traces, MongoDB URIs, or Clerk secrets (500 → `"Internal server error"`; DB failure logs error name only).
- No secrets hardcoded in source; `.env.example` files are placeholders; local `.env` files git-ignored.
- Admin identity (`ADMIN_EMAIL`) comes from **environment only** (hardcoded fallback removed in Step 15; fail-closed when unset).

---

## Quiz flow

```
Start (signed-in gating, "Ready to Start?")
  → Questions (timer starts, single interval, realtime answer persistence)
  → Answers (navigation via prev/next/indicators, per-question selection)
  → Submit (confirmation → single POST, auto-submit at time-up, overlap deduped)
  → Server Scoring (backend grades against stored answerKey)
  → Results (server summary + percentage rendered)
  → Review (server review snapshot: your answer vs correct answer per question)
```

Failure paths: catalog fetch failure, corrupt localStorage, submission 500 (retry
allowed, stays in quiz), signed-out submit (login gate) — all handled without
crash or duplicate requests.

---

## Persistence

- Storage key: `techQuizMasterProgress` (localStorage), written only by
  `useQuizPersistence` / timer snapshots — envelope schema unchanged since
  Step 10; the per-level record gained one field in Phase 2 Step 4.
- Envelope: `{ currentTech, currentLevel, progressByTech: {tech: {level: record}} }`.
- Per-level record: `userAnswers`, `currentQuestion`, `completedQuestions`,
  `isQuizStarted`, `isSubmitted`, `reviewMode`, `showResults`, `timeLeft`,
  `timerStartedAt`, `elapsedTime`, server `summary` + `reviewSnapshot`, and
  **`attemptId`** (UUID minted at Start / Start New, reused by Resume;
  `null` until an attempt starts). Submission reads it from this record, so
  a retry after a failed or lost response always re-sends the same key.
  Records saved before Step 4 simply have no `attemptId` and pick one up on
  resume/submit.
- Progress is isolated per technology **and** per level (verified by regression
  harness: answers never cross tech/level boundaries).
- Restore on load: the level active at unload is restored (answers + remaining
  time). Restore on level select: an in-progress record resumes the quiz with
  answers and timer intact.
- **Home behavior (known issue):** Home resets the *visible* session but the
  persisted record can keep `isQuizStarted: true`, so reselecting the same
  level resumes the previous quiz instead of showing the start screen. This is
  documented under Known limitations — no quick state hack applied.

---

## Testing

Latest results (Phase 2 Step 9 final run):

```text
Frontend lint:       0 errors / 2 warnings (pre-existing exhaustive-deps,
                     useQuizTimer.js only)
Frontend build:      PASS
Admin lint:          0 errors / 1 warning (pre-existing exhaustive-deps,
                     List.jsx only)
Admin build:         PASS

Backend suite:       149/149 (8/8 suites:
                     admin-authorization 21, result-scoring 24,
                     result-idempotency 16, result-history 9,
                     webhook 13, input-validation 31, security 25,
                     rate-limiting 10)

Frontend suites:     quizFlow 29/29, submissionPayload 9/9,
                     resultsFormatting 15/15, myResultFlow 7/7,
                     dashboardFlow 9/9, quizExperience 9/9,
                     resultsExperience 6/6, adminExperience 9/9
Backend boot check:  PASS (local mongodb-memory-server: index built before
                     listen, GET / 200 — production DB not contacted)

No browser E2E was performed (no Playwright in this project).
```

Baselines for comparison: Step 4 ended at backend 134/134 (7 suites) and
frontend quizFlow 29 + payload 9 + formatting 6; Step 5 adds the
`result-history` suite (+9), `myResultFlow` (+7) and formatting checks for the
performance/review helpers (+9); Step 6 adds the `dashboardFlow` harness (+9);
Step 7 adds the `quizExperience` harness (+9); Step 8 adds the
`resultsExperience` harness (+6); Step 9 adds the `adminExperience` harness
(run from `frontend/tests` against a Vite server rooted at `admin/`).
A follow-up admin polish pass extended `admin-authorization` to 21 checks
(duplicate endpoint + enriched stats) and `adminExperience` to 9 (list
duplicate refetch, detail duplicate navigation). Every pre-existing check is
unchanged and passing.

Historical (harnesses deleted after use, per protocol):

```text
Step 15 final run:    backend 117/117 (6 suites), submission helper 7/7
User-flow harness (Step 13): 125/125
Timer harness (Step 12):     17/17
Submission harness (Step 12): 20/20
```

---

## Production configuration checklist

### Render — backend

Required environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | supplied by Render (do not hardcode) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `CLERK_PUBLISHABLE_KEY` | from Clerk dashboard |
| `CLERK_SECRET_KEY` | from Clerk dashboard (secret) |
| `CLERK_WEBHOOK_SECRET` | Svix/Clerk webhook signing secret |
| `FRONTEND_URL` | actual Vercel frontend origin (e.g. `https://<frontend>.vercel.app`) |
| `ADMIN_URL` | actual Vercel admin origin (e.g. `https://<admin>.vercel.app`) |

Optional:

| Variable | Purpose |
|---|---|
| `ADMIN_EMAIL` | address that receives the `admin` role (fail-closed if unset) |
| `CORS_EXTRA_ORIGINS` | comma-separated extra allowed origins |
| `TRUST_PROXY` | proxy hops (default `1`; never `true`) |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_GENERAL_MAX`, `RATE_LIMIT_SUBMIT_MAX`, `RATE_LIMIT_ADMIN_MAX`, `RATE_LIMIT_WEBHOOK_MAX` | limiter tuning |
| `JSON_BODY_LIMIT`, `URLENCODED_BODY_LIMIT`, `WEBHOOK_BODY_LIMIT` | body caps |

Other Render settings: start command `npm start` (`node server.js`), Node
runtime ≥ 20 (`engines` in `backend/package.json`).

> Dashboard verification not performed — these values are **not** confirmed set
> on Render from this environment.

### Vercel — frontend

- Root Directory: **`frontend`** (repository root has no build script; SPA
  rewrite lives in `frontend/vercel.json`)
- Build command/output: Vite defaults (`npm run build` → `dist`)
- Environment variables:
  - `VITE_API_URL` = `<backend-url>/api`
  - `VITE_CLERK_PUBLISHABLE_KEY` = Clerk publishable key
  - `VITE_ADMIN_URL` = admin Vercel origin

### Vercel — admin

- Root Directory: **`admin`** (SPA rewrites in `admin/vercel.json`)
- Environment variables:
  - `VITE_API_URL` = `<backend-url>/api`
  - `VITE_CLERK_PUBLISHABLE_KEY` = Clerk publishable key
  - `VITE_ADMIN_URL` = admin app's own origin (post-upload redirect)

### Clerk

- Webhook endpoint path: **`/api/users/webhook/clerk`** (POST)
- The production Clerk webhook must point at the **deployed backend URL**
  (e.g. `https://<backend>.onrender.com/api/users/webhook/clerk`) with events
  `user.created`, `session.created`, `session.deleted`.
- Publishable keys in the two client apps; secret key + webhook secret only on
  Render.

> Clerk dashboard configuration has **not** been verified from this environment.

---

## Known limitations

1. **Home/Resume UX (RESOLVED in Phase 2).** Selecting a saved level now
   always lands on a start screen offering the explicit **Resume Quiz /
   Start New Quiz** choice (confirm dialog guards the saved attempt), and
   Step 6's dashboard *Continue learning* section surfaces resumable attempts
   without drilling into the rail. Kept for history; no open defect.
2. **Lint warnings (intentional).** Frontend: 2 `exhaustive-deps` warnings in
   `useQuizTimer.js` (`onTimeUp`, `onSaveTimerState` — wrapping them in
   `useCallback` would need unstable parent closures and risks refetch/re-render
   loops). Admin: 1 warning (`List.jsx` `request` dependency — refetch is
   driven by `attempt`/`location` on purpose; Dashboard and QuizPage carry
   explicit disable comments for the same reason). 0 errors everywhere;
   deliberately not "fixed".
3. **Deployment dashboards not verified.** Vercel projects, Render service, and
   the Clerk webhook/dashboard were not inspected or configured from this
   environment — repository configuration is verified only.
4. **Stale scratch files in `backend/`:** `.txt` and `SET_ADMIN_EMAIL.txt`
   contain outdated code copies (not executed). `frontend/src/App.css` is
   unreferenced. Cleanup candidates — left untouched in Step 15 by design.
5. **`ADMIN_EMAIL` is optional** (not in the fail-fast required list); when
   unset, nobody is granted the admin role via webhook (fail-closed) — set it
   on Render to create the admin user.
6. **Minor log noise:** dotenv prints a one-line tip at boot; Clerk SDK prints
   a deprecation notice (`@clerk/clerk-sdk-node` → `@clerk/express` suggested
   upstream). Cosmetic.
7. **No browser E2E** yet (Playwright intentionally not introduced).
8. **Legacy results have no per-question review.** Records created by the
   temporary client-scored branch (no `selectedAnswers`) cannot be reopened
   for review; the dialog shows an explicit "review isn't available" message
   while score/totals/date stay accurate. Fixing it would require backfilling
   snapshots that were never stored — not possible retroactively.
9. **Performance trend needs 6+ scored attempts** (3-vs-3 windows). Below
   that the tile shows an honest "Needs 6+ attempts" placeholder rather than a
   guessed direction — by design, not a defect.
10. **`GET /results/my-results` defaults to unlimited rows** (optional
   `?limit=1..200` exists but no current consumer passes it, because history
   and the performance summary must cover ALL attempts to be exact). If a user
   accumulated thousands of attempts, response size would grow linearly.

---

## Next phase

**Phase 2 Steps 1–9 complete** (flow harness, secure scoring, results
formatting, submission idempotency, attempt history & performance tracking,
premium design system & user dashboard, premium technology selection & quiz
experience, premium results & answer review, premium admin dashboard & quiz
management). Next: Phase 2 Step 10, then the
major UI/UX and advanced feature development queued after Step 15.
