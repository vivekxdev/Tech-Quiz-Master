// Phase 2 / Step 5: attempt history, performance summary and historical
// review (DOM level).
//
// Renders the real <MyResult/> through Vite's SSR module loader so the JSX
// source runs unmodified, with Clerk and the HTTP client replaced by the
// shared harness stubs. Uses only real stored rows served from a stubbed
// GET /results/my-results — no fabricated entries.
//
// Run:  node tests/myResultFlow.test.mjs      (from the frontend directory)

import { JSDOM } from "jsdom";
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, "..");

// ---------------------------------------------------------------------------
// tiny assertion runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push(name);
    console.error(`FAIL: ${name}`);
    console.error(`  ${err && err.message}`);
  } finally {
    await unmount();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  expected: ${e}\n  actual:   ${a}`);
}

// ---------------------------------------------------------------------------
// DOM globals (must exist before react-dom is loaded)
// ---------------------------------------------------------------------------
const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { url: "http://localhost/result", pretendToBeVisual: true },
);
const { window } = dom;

const defineGlobal = (key, value) =>
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });

defineGlobal("window", window);
defineGlobal("document", window.document);
defineGlobal("navigator", window.navigator);
defineGlobal("localStorage", window.localStorage);
for (const key of [
  "HTMLElement",
  "HTMLInputElement",
  "Element",
  "Node",
  "SVGElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "CustomEvent",
  "getComputedStyle",
]) {
  const value = window[key];
  defineGlobal(key, typeof value === "function" ? value.bind(window) : value);
}
defineGlobal("requestAnimationFrame", window.requestAnimationFrame?.bind(window));
defineGlobal("cancelAnimationFrame", window.cancelAnimationFrame?.bind(window));

window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
window.Element.prototype.scrollIntoView = function scrollIntoView() {};

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => {
  for (let i = 0; i < 8; i++) await tick(0);
  await tick(2);
};

// Wait for an async state change (fetch resolution, retry) without sleeping
// a fixed amount that could flake on a slow machine.
async function waitFor(predicate, label, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await tick(20);
  }
  throw new Error(`timed out waiting for: ${label}`);
}

// ---------------------------------------------------------------------------
// fixtures: real-shaped result rows (what GET /results/my-results returns)
// ---------------------------------------------------------------------------
const snapshot = (correct, total) =>
  Array.from({ length: total }, (_, index) => ({
    questionId: `656f000000000000000000q${index}`,
    question: `Question ${index + 1}?`,
    options: ["Alpha", "Bravo", "Charlie", "Delta"],
    // Correct option is always index 0; a wrong pick uses index 1.
    selectedAnswer: index < correct ? 0 : 1,
    correctAnswer: 0,
    isCorrect: index < correct,
  }));

const historyRow = ({
  month,
  correct,
  withReview = true,
  technology = "javascript",
  includeStartDate = true,
}) => {
  const iso = `2025-${month}-01T12:00:00.000Z`;
  return {
    _id: `row-${month}-${correct}`,
    userId: "clerk_test",
    userName: "Tester",
    userEmail: "t@test.local",
    technology,
    level: "basic",
    totalQuestions: 10,
    correctAnswers: correct,
    score: correct,
    timeTaken: 60,
    ...(includeStartDate ? { startDate: iso } : {}),
    createdAt: iso,
    ...(withReview ? { selectedAnswers: snapshot(correct, 10) } : {}),
  };
};

// Newest first, exactly as the API returns them: three strong recent attempts
// (9/10) over three weak early ones (1/10) => average 50%, best 90%,
// trend +80 (90 vs 10).
const SIX_ROWS = [
  historyRow({ month: "06", correct: 9 }),
  historyRow({ month: "05", correct: 9 }),
  historyRow({ month: "04", correct: 9 }),
  historyRow({ month: "03", correct: 1 }),
  historyRow({ month: "02", correct: 1 }),
  historyRow({ month: "01", correct: 1 }),
];

const okHandler = (rows) => async (endpoint, method) => {
  if (endpoint === "/results/my-results") return rows;
  throw new Error(`unexpected endpoint ${endpoint}`);
};

// ---------------------------------------------------------------------------
// Vite server with the Clerk / API modules stubbed out
// ---------------------------------------------------------------------------
const server = await createServer({
  root: FRONTEND_ROOT,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: [
      {
        find: "@clerk/clerk-react",
        replacement: path.join(HERE, "harness", "clerkStub.mjs"),
      },
      {
        find: /^.*services\/api\/api\.js$/,
        replacement: path.join(HERE, "harness", "apiStub.mjs"),
      },
    ],
  },
});

const { setRequestHandler, resetApiStub, getApiCalls } = await server.ssrLoadModule(
  "/tests/harness/apiStub.mjs",
);

const { default: MyResult } = await server.ssrLoadModule(
  "/src/components/MyResult.jsx",
);
const { MemoryRouter } = await import("react-router-dom");
const { createRoot } = await import("react-dom/client");
const ReactModule = await import("react");
const React = ReactModule.default ?? ReactModule;

// ---------------------------------------------------------------------------
// world helpers
// ---------------------------------------------------------------------------
let root = null;
let container = null;

async function mount({ handler } = {}) {
  resetApiStub();
  setRequestHandler(handler || okHandler(SIX_ROWS));

  container = window.document.createElement("div");
  window.document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/result"] },
      React.createElement(MyResult),
    ),
  );
  await flush();
}

async function unmount() {
  if (root) {
    root.unmount();
    root = null;
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }
  container = null;
  await flush();
  resetApiStub();
}

const $$ = (selector, scope = window.document) => [...scope.querySelectorAll(selector)];

const pageText = () => window.document.body.textContent.replace(/\s+/g, " ");

const cards = () => $$("article");

const buttonByText = (text, scope = window.document) =>
  $$("button", scope).find(
    (b) => b.textContent.replace(/\s+/g, " ").trim() === text,
  );

const click = async (element, label = "element") => {
  assert(element, `could not find ${label}`);
  element.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  await flush();
};

const dialog = () => window.document.querySelector('[role="dialog"]');

const summarySection = () => {
  const heading = $$("h2").find(
    (el) => el.textContent.trim() === "Performance summary",
  );
  return heading ? heading.closest("section") : null;
};

// Resolve one performance tile by its visible label: [label, value, sub].
const summaryTile = (label) => {
  const section = summarySection();
  assert(section, "performance summary section missing");
  const labelEl = [...section.querySelectorAll("div")].find(
    (node) => node.children.length === 0 && node.textContent.trim() === label,
  );
  assert(labelEl, `tile label missing: ${label}`);
  const [tileLabel, value, sub] = [...labelEl.parentElement.children].map(
    (node) => node.textContent.trim(),
  );
  return { label: tileLabel, value, sub };
};

// ---------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------
console.log("\n=== Tech Quiz Master - Phase 2 Step 5 attempt history ===\n");

await check("1. history loads with states, cards newest-first, real summary", async () => {
  // Delay the response so the loading state can be observed first.
  let releaseRows = null;
  await mount({
    handler: (endpoint, method) => {
      if (endpoint !== "/results/my-results") {
        throw new Error(`unexpected endpoint ${endpoint}`);
      }
      return new Promise((resolve) => {
        releaseRows = () => resolve(SIX_ROWS);
      });
    },
  });

  const loading = window.document.querySelector('[role="status"]');
  assert(loading, "loading state must be visible while the fetch is pending");
  assert(!summarySection(), "no summary before the data arrives");

  releaseRows();
  await waitFor(() => summarySection(), "history to render");

  // Cards: all six rows, newest month first in the DOM.
  assertEqual(cards().length, 6, "every stored attempt must render a card");
  assert(
    cards()[0].textContent.includes("Jun"),
    "newest attempt must be first",
  );
  assert(
    cards()[cards().length - 1].textContent.includes("Jan"),
    "oldest attempt must be last",
  );
  assert(pageText().includes("JAVASCRIPT Basic"), "quiz title missing");

  // Performance summary: computed from exactly these six rows.
  assertEqual(summaryTile("Total attempts").value, "6", "attempt count");
  assertEqual(summaryTile("Average score").value, "50%", "average score");
  assertEqual(summaryTile("Best score").value, "90%", "best score");

  const trend = summaryTile("Recent trend");
  assertEqual(trend.value, "↑ +80%", "trend direction and delta");
  assert(
    trend.sub.includes("90% vs 10%"),
    `trend must show its window averages, got: ${trend.sub}`,
  );
});

await check("2. trend shows an honest placeholder below the 6-attempt minimum", async () => {
  await mount({
    handler: okHandler(SIX_ROWS.slice(0, 3)),
  });
  await waitFor(() => summarySection(), "summary for a short history");

  assertEqual(summaryTile("Total attempts").value, "3");
  const trend = summaryTile("Recent trend");
  assertEqual(trend.value, "—", "no fabricated direction");
  assert(
    trend.sub.includes("Needs 6+ attempts"),
    `placeholder must state the requirement, got: ${trend.sub}`,
  );
});

await check("3. empty history shows the empty state, not a fake summary", async () => {
  await mount({ handler: okHandler([]) });
  await waitFor(() => pageText().includes("No results yet"), "empty state");

  assert(!summarySection(), "no performance summary without real rows");
  assertEqual(cards().length, 0, "no fabricated entries");
  assert(pageText().includes("Start practicing"), "empty state needs a next step");
});

await check("4. a failed history load shows an error state and retry recovers", async () => {
  let shouldFail = true;
  await mount({
    handler: (endpoint, method) => {
      if (shouldFail) throw new Error("network down");
      return okHandler(SIX_ROWS)(endpoint, method);
    },
  });

  await waitFor(
    () => pageText().includes("Couldn't load your results"),
    "error state",
  );
  assert(pageText().includes("network down"), "the safe message must surface");

  shouldFail = false;
  await click(buttonByText("Try again"), "retry button");
  await waitFor(() => summarySection(), "history to load after retry");

  assertEqual(getApiCalls().filter((c) => c.endpoint === "/results/my-results").length, 2, "retry must refetch exactly once");
  assertEqual(summaryTile("Total attempts").value, "6");
});

await check("5. reopening a past attempt shows its stored review", async () => {
  await mount();
  await waitFor(() => cards().length === 6, "cards to render");

  await click(buttonByText("Review answers"), "review button");

  const panel = dialog();
  assert(panel, "review dialog must open");
  assert(
    document.activeElement && panel.contains(document.activeElement),
    "focus must land inside the dialog",
  );
  assert(
    panel.textContent.includes("Review — JAVASCRIPT Basic"),
    "dialog must identify the attempt",
  );
  assert(panel.textContent.includes("Question 1?"), "question text missing");
  assert(
    panel.textContent.includes("Your answer · Correct"),
    "correct pick must be labelled",
  );
  assert(
    panel.textContent.includes("Correct answer"),
    "the correct option must be shown",
  );
  assert(
    panel.textContent.includes("Completed attempt"),
    "attempt status must be shown",
  );
  // The authorized contract only: no stored answer key anywhere in the DOM.
  assert(!pageText().includes("answerKey"), "answer key leaked into the UI");

  // Escape closes, like every other dialog in the app.
  window.document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await flush();
  assert(!dialog(), "Escape must close the review");
});

await check("6. legacy attempts explain that review data is unavailable", async () => {
  await mount({
    handler: okHandler([
      historyRow({
        month: "05",
        correct: 6,
        withReview: false,
        technology: "python",
        includeStartDate: false,
      }),
    ]),
  });
  await waitFor(() => cards().length === 1, "legacy card to render");

  // Legacy row without startDate must still show a date (createdAt fallback).
  assert(
    cards()[0].textContent.includes("May"),
    "legacy card must fall back to createdAt for its date",
  );

  await click(buttonByText("Review answers"), "legacy review button");
  const panel = dialog();
  assert(panel, "review dialog must open for legacy rows too");
  assert(
    panel.textContent.includes("Review isn't available for this attempt"),
    "legacy rows need the graceful message",
  );
  assert(
    panel.textContent.includes("score, totals and date above are still accurate"),
    "the message must say what IS available",
  );

  await click(buttonByText("Close"), "close button");
  assert(!dialog(), "Close button must dismiss the review");
});

await check("7. the page requests only the personal results endpoint", async () => {
  await mount();
  await waitFor(() => cards().length === 6, "history to render");

  const endpoints = [...new Set(getApiCalls().map((call) => call.endpoint))];
  assertEqual(endpoints, ["/results/my-results"], "no other endpoints touched");
});

// ---------------------------------------------------------------------------
// teardown
// ---------------------------------------------------------------------------
await server.close();
console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) {
  console.error(`Failed:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
