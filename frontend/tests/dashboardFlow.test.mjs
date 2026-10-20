// Phase 2 / Step 6 dashboard harness.
//
// Renders the real <Sidebar/> (through Vite's SSR module loader so the JSX
// source runs unmodified) inside jsdom, with Clerk and the HTTP client
// replaced by the stubs in ./harness. It exercises the redesigned dashboard:
// welcome hero, "Continue learning" cards derived from saved progress, and
// the performance snapshot computed from real /results/my-results rows —
// including its loading, empty, error+retry, malformed-payload and
// signed-out states.
//
// Run:  node tests/dashboardFlow.test.mjs      (from the frontend directory)

import { JSDOM } from "jsdom";
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, "..");
const STORAGE_KEY = "techQuizMasterProgress";

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
  { url: "http://localhost/", pretendToBeVisual: true },
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
globalThis.__alerts = [];
defineGlobal("alert", (message) => {
  globalThis.__alerts.push(String(message));
});

window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
window.Element.prototype.scrollIntoView = function scrollIntoView() {};

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => {
  for (let i = 0; i < 8; i++) await tick(0);
  await tick(2);
};

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------
const makeQuestions = (prefix, count) =>
  Array.from({ length: count }, (_, i) => ({
    _id: `656f00000000000000000${prefix}${i + 1}`,
    question: `${prefix.toUpperCase()} question ${i + 1}`,
    options: ["Alpha", "Bravo", "Charlie", "Delta"],
  }));

const CATALOG = {
  quizzes: [
    {
      _id: "656f0000000000000000aa01",
      technology: "JavaScript",
      level: "basic",
      timeLimit: 10,
      questions: makeQuestions("a", 5),
    },
    {
      _id: "656f0000000000000000aa02",
      technology: "JavaScript",
      level: "intermediate",
      timeLimit: 15,
      questions: makeQuestions("b", 3),
    },
    {
      _id: "656f0000000000000000aa03",
      technology: "HTML",
      level: "basic",
      timeLimit: 5,
      questions: makeQuestions("c", 3),
    },
  ],
};

// Two scored attempts: 4/5 = 80%, 1/3 = 33% -> attempts 2, average 57,
// best 80, no trend (needs 6+). Same row shape /results/my-results returns.
const HISTORY_TWO = [
  {
    technology: "JavaScript",
    level: "basic",
    totalQuestions: 5,
    correctAnswers: 4,
    createdAt: "2026-01-05T10:00:00.000Z",
    selectedAnswers: [],
  },
  {
    technology: "HTML",
    level: "basic",
    totalQuestions: 3,
    correctAnswers: 1,
    createdAt: "2026-01-04T10:00:00.000Z",
    selectedAnswers: [],
  },
];

// Six scored attempts, newest first: recent 3 = 100/80/60 (avg 80),
// previous 3 = 40/20/0 (avg 20) -> trend +60 pts (up); overall average 50,
// best 100. Exact percentages are authored directly so the asserted math is
// the same round(correct/total) the summary performs.
const HISTORY_SIX_EXACT = [
  { correct: 5, total: 5, day: "2026-01-10" }, // 100
  { correct: 4, total: 5, day: "2026-01-09" }, // 80
  { correct: 3, total: 5, day: "2026-01-08" }, // 60
  { correct: 2, total: 5, day: "2026-01-07" }, // 40
  { correct: 1, total: 5, day: "2026-01-06" }, // 20
  { correct: 0, total: 5, day: "2026-01-05" }, // 0
].map((row) => ({
  technology: "JavaScript",
  level: "basic",
  totalQuestions: row.total,
  correctAnswers: row.correct,
  createdAt: `${row.day}T10:00:00.000Z`,
  selectedAnswers: [],
}));

const defaultResults = HISTORY_TWO;

const defaultHandler = async (endpoint) => {
  if (endpoint === "/admin/quizzes") return CATALOG;
  if (endpoint === "/results/my-results") return defaultResults;
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

const { setRequestHandler, resetApiStub, getApiCalls } =
  await server.ssrLoadModule("/tests/harness/apiStub.mjs");
const { setSignedIn, resetClerkStub } = await server.ssrLoadModule(
  "/tests/harness/clerkStub.mjs",
);

const { STORAGE_KEY: LIVE_STORAGE_KEY } = await server.ssrLoadModule(
  "/src/utils/quizStorage.js",
);
if (LIVE_STORAGE_KEY !== STORAGE_KEY) {
  throw new Error(`storage key drifted: ${LIVE_STORAGE_KEY}`);
}

const { default: Sidebar } = await server.ssrLoadModule(
  "/src/components/Sidebar.jsx",
);
const { createRoot } = await import("react-dom/client");
const ReactModule = await import("react");
const React = ReactModule.default ?? ReactModule;
// Sidebar now carries an in-app <Link> (performance snapshot → /result), so
// the mount needs a Router context — same pattern as resultsExperience.
const { MemoryRouter } = await import("react-router-dom");

// ---------------------------------------------------------------------------
// world helpers
// ---------------------------------------------------------------------------
let root = null;
let container = null;

const readStorage = () => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { __unparsable: raw };
  }
};

const writeStorage = (value) => {
  window.localStorage.setItem(
    STORAGE_KEY,
    typeof value === "string" ? value : JSON.stringify(value),
  );
};

async function mount({ signedIn = true, storage, handler } = {}) {
  resetApiStub();
  resetClerkStub();
  setSignedIn(signedIn);
  setRequestHandler(handler || defaultHandler);
  window.localStorage.clear();
  if (storage !== undefined && storage !== null) writeStorage(storage);

  container = window.document.createElement("div");
  window.document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(MemoryRouter, null, React.createElement(Sidebar)),
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
  window.localStorage.clear();
  resetApiStub();
  resetClerkStub();
  globalThis.__alerts.length = 0;
}

const $$ = (selector, scope = window.document) => [
  ...scope.querySelectorAll(selector),
];

const buttonByText = (text, scope = window.document) =>
  $$("button", scope).find(
    (b) => b.textContent.replace(/\s+/g, " ").trim() === text,
  );

const main = () => window.document.querySelector("main");

const click = async (element, label = "element") => {
  assert(element, `could not find ${label}`);
  element.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  await flush();
};

const pageText = () => window.document.body.textContent.replace(/\s+/g, " ");

const waitFor = async (predicate, label, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await tick(25);
  assert(predicate(), `timed out waiting for ${label}`);
};

const historyCalls = () =>
  getApiCalls().filter((call) => call.endpoint === "/results/my-results");

const seededStorage = (recordOverrides = {}) => ({
  currentTech: null,
  currentLevel: null,
  timestamp: new Date().toISOString(),
  progressByTech: {
    javascript: {
      basic: {
        currentQuestion: 4,
        userAnswers: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        completedQuestions: [0, 1, 2, 3, 4],
        showResults: false,
        isSubmitted: false,
        reviewMode: false,
        timeLeft: 300,
        timerStartedAt: null,
        elapsedTime: 65,
        isQuizStarted: true,
        attemptId: "656f0000-0000-4000-8000-000000000001",
        summary: null,
        reviewSnapshot: null,
        ...recordOverrides,
      },
    },
  },
});

// ---------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------

console.log("\n=== Tech Quiz Master - Phase 2 Step 6 dashboard harness ===\n");

await check("1. dashboard shows welcome and real performance tiles", async () => {
  await mount();
  assert(
    pageText().includes("Ready for your next quiz?"),
    "welcome hero missing",
  );
  assert(
    pageText().includes("Select a technology"),
    "entry point copy missing",
  );
  assert(pageText().includes("Your performance"), "performance section missing");
  assert(pageText().includes("Attempts"), "attempts tile missing");
  assert(pageText().includes("57%"), "average tile must show 57%");
  assert(pageText().includes("80%"), "best tile must show 80%");
  assert(
    pageText().includes("Needs 6+ attempts"),
    "trend placeholder must be honest below 6 attempts",
  );
  assertEqual(historyCalls().length, 1, "history must be fetched exactly once");
  await unmount();
});

await check("2. six scored attempts surface the trend with real math", async () => {
  const handler = async (endpoint) => {
    if (endpoint === "/admin/quizzes") return CATALOG;
    if (endpoint === "/results/my-results") return HISTORY_SIX_EXACT;
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
  await mount({ handler });
  await waitFor(() => pageText().includes("+60 pts"), "trend value");
  assert(
    pageText().includes("Last 3 vs previous 3"),
    "trend label missing",
  );
  assert(pageText().includes("50%"), "average must be 50%");
  assert(pageText().includes("100%"), "best must be 100%");
  await unmount();
});

await check("3. a resumable attempt is surfaced and continues safely", async () => {
  await mount({ storage: seededStorage() });
  assert(pageText().includes("Continue learning"), "continue section missing");
  assert(pageText().includes("1 in progress"), "count pill missing");
  assert(pageText().includes("5/5 answered"), "answered count missing");
  assert(pageText().includes("01:05 elapsed"), "elapsed time missing");
  assert(
    window.document.querySelector(
      'span[title="1 of 2 levels completed"]',
    ),
    "tech completion pill missing",
  );

  await click(buttonByText("Continue", main()), "Continue button");
  assert(pageText().includes("Ready to Start?"), "start screen missing");
  assert(
    buttonByText("Resume Quiz", main()),
    "Resume Quiz must be offered on the start screen",
  );
  assert(
    buttonByText("Start New Quiz", main()),
    "Start New Quiz must be offered on the start screen",
  );

  const record = readStorage()?.progressByTech?.javascript?.basic;
  assert(record, "the saved record must survive Continue");
  assertEqual(
    record.userAnswers,
    { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
    "Continue must never touch the saved answers",
  );
  await unmount();
});

await check("4. completed attempts are never offered as continue items", async () => {
  await mount({
    storage: seededStorage({ isSubmitted: true, isQuizStarted: false }),
  });
  assert(
    !pageText().includes("Continue learning"),
    "a submitted attempt must not be resumable",
  );
  assert(pageText().includes("Your performance"), "dashboard must still render");
  await unmount();
});

await check("5. an empty history shows an honest empty state", async () => {
  const handler = async (endpoint) => {
    if (endpoint === "/admin/quizzes") return CATALOG;
    if (endpoint === "/results/my-results") return [];
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
  await mount({ handler });
  await waitFor(() => pageText().includes("No attempts yet"), "empty state");
  assert(
    !pageText().includes("Needs 6+ attempts"),
    "no trend placeholder should render without attempts",
  );
  assert(
    !pageText().includes("Average"),
    "tiles must not render without attempts",
  );
  await unmount();
});

await check("6. a failed history fetch shows an error and retries", async () => {
  let resultsCalls = 0;
  const handler = async (endpoint) => {
    if (endpoint === "/admin/quizzes") return CATALOG;
    if (endpoint === "/results/my-results") {
      resultsCalls += 1;
      if (resultsCalls === 1) throw new Error("network down");
      return HISTORY_TWO;
    }
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
  await mount({ handler });
  await waitFor(
    () => pageText().includes("Performance is unavailable"),
    "error state",
  );
  assert(pageText().includes("network down"), "the failure must be surfaced");

  await click(buttonByText("Try again", main()), "retry button");
  await waitFor(() => pageText().includes("57%"), "tiles after retry");
  assertEqual(historyCalls().length, 2, "retry must refetch exactly once");
  await unmount();
});

await check("7. a malformed history payload shows the safe message", async () => {
  const handler = async (endpoint) => {
    if (endpoint === "/admin/quizzes") return CATALOG;
    if (endpoint === "/results/my-results") return { ok: true };
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
  await mount({ handler });
  await waitFor(
    () => pageText().includes("unexpected response"),
    "safe malformed-payload message",
  );
  await unmount();
});

await check("8. signed-out users get no performance fetch or section", async () => {
  await mount({ signedIn: false });
  assertEqual(historyCalls().length, 0, "no authenticated history call");
  assert(
    !pageText().includes("Your performance"),
    "performance section must be hidden without sign-in",
  );
  assert(
    pageText().includes("Select a technology"),
    "the dashboard must still render",
  );
  assert(
    !pageText().includes("undefined"),
    "signed-out dashboard must not leak `undefined`",
  );
  await unmount();
});

await check("9. corrupted storage still boots the dashboard safely", async () => {
  await mount({ storage: "{ this is not json ]" });
  assert(
    pageText().includes("Select a technology"),
    "app did not boot from malformed JSON",
  );
  assert(
    !pageText().includes("Continue learning"),
    "no continue section without valid progress",
  );
  assert(
    !pageText().includes("undefined"),
    "corrupt storage leaked `undefined` into the UI",
  );
  await unmount();
});

// ---------------------------------------------------------------------------
// teardown
// ---------------------------------------------------------------------------
await server.close();

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) {
  console.error(`Failed:\n  - ${failures.join("\n  - ")}`);
}
process.exit(failed > 0 ? 1 : 0);
