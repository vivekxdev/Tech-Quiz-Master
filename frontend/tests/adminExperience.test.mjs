// Phase 2 / Step 9: premium admin dashboard & quiz management harness.
//
// Renders the real admin <Dashboard/>, <List/> and <QuizPage/> through a
// second Vite SSR server rooted at ../admin, with the HTTP client replaced
// by admin/tests/harness/apiStub.mjs (aliased over src/services/api/api.js)
// and React/router loaded via admin/tests/harness/bridge.mjs so every module
// shares one React instance. It covers the Step 9 admin work:
//   - dashboard hierarchy, label associations and honest platform stats
//     (loading / error + retry, only real GET /admin/stats values)
//   - CSV drop -> preview -> create-quiz payload byte-for-byte contract
//   - quiz list loading / error + retry / empty / filtered-no-match states
//   - search, level filter and per-card metadata (missing-field fallbacks)
//   - delete confirmation dialog a11y, Escape, visible success/failure toasts
//   - list & detail duplicate: server-side clone, refetch/navigation, no leaks
//   - quiz detail loading / content / error + retry, with no answer keys
//
// Run:  node tests/adminExperience.test.mjs      (from the frontend directory)

import { JSDOM } from "jsdom";
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, "..");
const ADMIN_ROOT = path.resolve(FRONTEND_ROOT, "..", "admin");

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
  { url: "http://localhost/dashboard", pretendToBeVisual: true },
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
  "File",
  "FileReader",
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

async function waitFor(predicate, label, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await tick(20);
  }
  throw new Error(`timed out waiting for: ${label}`);
}

// ---------------------------------------------------------------------------
// fixtures (shapes the real admin endpoints return)
// ---------------------------------------------------------------------------
const STATS = { totalUsers: 42, loggedInUsers: 7, loggedInPercentage: "16.67" };

const LONG_NAME =
  "Extremely Long Technology Name That Stretches Far Beyond Any Normal Card Width For Layout Testing";

const QUIZZES = [
  {
    _id: "quiz1",
    technology: "JavaScript",
    level: "Basic",
    timeLimit: 15,
    totalQuestions: 5,
    createdAt: "2025-06-15T12:00:00.000Z",
  },
  {
    _id: "quiz2",
    technology: LONG_NAME,
    level: "Advanced",
    timeLimit: null,
    totalQuestions: null,
    questions: [{}, {}, {}],
    createdAt: null,
  },
];

const QUIZ_DETAIL = {
  _id: "quiz1",
  technology: "JavaScript",
  level: "Basic",
  timeLimit: 10,
  totalQuestions: 5,
  createdAt: "2025-06-15T12:00:00.000Z",
  questions: [
    {
      _id: "q1",
      question: "What is a closure?",
      options: ["A function", "A loop", "A variable", "A class"],
    },
  ],
};

const CSV =
  "Question,Option A,Option B,Option C,Option D,Answer\n" +
  "What is 2 plus 2?,One,Two,Three,Four,One\n";

// ---------------------------------------------------------------------------
// Vite server rooted at the admin app, with the API client aliased away
// ---------------------------------------------------------------------------
const server = await createServer({
  root: ADMIN_ROOT,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  server: {
    middlewareMode: true,
    hmr: false,
    watch: null,
    fs: { allow: [ADMIN_ROOT, FRONTEND_ROOT] },
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: [
      {
        find: /^.*services\/api\/api\.js$/,
        replacement: path.join(ADMIN_ROOT, "tests", "harness", "apiStub.mjs"),
      },
    ],
  },
});

const { setRequestHandler, resetApiStub, getApiCalls } = await server.ssrLoadModule(
  "/tests/harness/apiStub.mjs",
);
const { React, createRoot, MemoryRouter, Routes, Route } =
  await server.ssrLoadModule("/tests/harness/bridge.mjs");
const { dashboardStyles, listPageStyles } = await server.ssrLoadModule(
  "/src/assets/dummyStyles.jsx",
);
const { default: Dashboard } = await server.ssrLoadModule(
  "/src/components/Dashboard.jsx",
);
const { default: List } = await server.ssrLoadModule(
  "/src/components/List.jsx",
);
const { default: QuizPage } = await server.ssrLoadModule(
  "/src/Pages/QuizPage.jsx",
);

// ---------------------------------------------------------------------------
// world helpers
// ---------------------------------------------------------------------------
let root = null;
let container = null;

const render = (element) => {
  container = window.document.createElement("div");
  window.document.body.appendChild(container);
  root = createRoot(container);
  root.render(element);
};

async function mountDashboard({ handler } = {}) {
  resetApiStub();
  setRequestHandler(handler);
  render(
    React.createElement(MemoryRouter, null, React.createElement(Dashboard)),
  );
  await flush();
}

async function mountList({ handler } = {}) {
  resetApiStub();
  setRequestHandler(handler);
  render(
    React.createElement(MemoryRouter, null, React.createElement(List)),
  );
  await flush();
}

async function mountQuizPage({ handler, id = "quiz1" } = {}) {
  resetApiStub();
  setRequestHandler(handler);
  render(
    React.createElement(
      MemoryRouter,
      { initialEntries: [`/quiz/${id}`] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: "/quiz/:id",
          element: React.createElement(QuizPage),
        }),
      ),
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
  window.localStorage.clear();
  resetApiStub();
}

const $$ = (selector, scope = window.document) => [...scope.querySelectorAll(selector)];

const pageText = () => window.document.body.textContent.replace(/\s+/g, " ");

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

// React tracks input values; the native setter + input event is what makes
// controlled components notice the change.
const setValue = (input, value, label = "input") => {
  assert(input, `could not find ${label}`);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
};

const dropCsv = async (file) => {
  const dropzone = $$('[role="button"]').find((el) =>
    (el.getAttribute("aria-label") || "").startsWith("Upload questions CSV"),
  );
  assert(dropzone, "CSV dropzone missing");
  const event = new window.Event("drop", { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer: { files: [file] } });
  dropzone.dispatchEvent(event);
  await flush();
};

const pressEscape = async () => {
  window.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  await flush();
};

const dialog = () => window.document.querySelector('[role="dialog"]');

// Quiz cards as rendered by List's card registry class.
const quizCards = () =>
  $$("div").filter(
    (d) => typeof d.className === "string" && d.className === listPageStyles.card,
  );

const statsSection = () =>
  window.document.querySelector('[aria-label="Platform statistics"]');

// The dashboard toast is always in the DOM (hidden by class); visible means
// the registry's toastVisible class is applied.
const dashboardToastVisible = (message) => {
  const node = $$("div").find(
    (el) =>
      el.className.includes(dashboardStyles.toastOuter) &&
      el.textContent.includes(message),
  );
  return (
    node &&
    node.className.includes(dashboardStyles.toastVisible) &&
    !node.className.includes(dashboardStyles.toastHidden)
  );
};

const endpoints = () => [...new Set(getApiCalls().map((c) => c.endpoint))];

// ---------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------
console.log(
  "\n=== Tech Quiz Master - Phase 2 Step 9 admin dashboard & quiz management ===\n",
);

await check("1. dashboard hierarchy, labels and honest platform stats", async () => {
  await mountDashboard({ handler: async () => STATS });
  await waitFor(() => statsSection()?.textContent.includes("42"), "stats to load");

  // Page hierarchy.
  assertEqual(
    $$("h1").map((h) => h.textContent.trim()),
    ["Dashboard"],
    "one page heading",
  );
  assert(
    $$("h2").some((h) => h.textContent.trim() === "Create New Quiz"),
    "create-quiz heading missing",
  );
  assert(
    $$("h2").some((h) => h.textContent.trim() === "Platform stats"),
    "stats heading missing",
  );
  assert(buttonByText("Manage quizzes"), "list navigation missing");

  // Stats come from the real endpoint, never fabricated numbers.
  const stats = statsSection();
  assert(
    stats.textContent.includes("Registered users") &&
      stats.textContent.includes("42"),
    "registered users must show the API value",
  );
  assert(
    stats.textContent.includes("Logged in") && stats.textContent.includes("7"),
    "logged-in count must show the API value",
  );
  assert(
    stats.textContent.includes("16.67%"),
    "login rate must show the API value with its unit",
  );

  // Every required field is programmatically labelled.
  for (const [forId, inputId] of [
    ["quiz-technology", "quiz-technology"],
    ["quiz-time-limit", "quiz-time-limit"],
    ["quiz-csv-input", "quiz-csv-input"],
  ]) {
    const label = window.document.querySelector(`label[for="${forId}"]`);
    assert(label, `label for ${forId} missing`);
    assert(window.document.getElementById(inputId), `input ${inputId} missing`);
  }

  // Level group with pressed state.
  const group = window.document.querySelector('[role="group"][aria-label="Level"]');
  assert(group, "level group missing");
  const levelButtons = $$("button", group);
  assertEqual(levelButtons.length, 3, "three level options");
  assert(
    levelButtons.find((b) => b.textContent.includes("Basic"))
      .getAttribute("aria-pressed") === "true",
    "Basic starts pressed",
  );

  // Dropzone keyboard/reachable affordances.
  const dropzone = $$('[role="button"]').find((el) =>
    (el.getAttribute("aria-label") || "").startsWith("Upload questions CSV"),
  );
  assert(dropzone, "dropzone not exposed as a button");
  assertEqual(dropzone.getAttribute("tabindex"), "0", "dropzone focusable");

  // Tips aside, summary status and the disabled submit button.
  const tips = $$("aside").find((a) => a.textContent.includes("Quick Tips"));
  assert(tips, "Quick Tips aside missing");
  assert(pageText().includes("Incomplete"), "summary must start incomplete");
  assert(
    buttonByText("Create Quiz")?.disabled,
    "submit stays disabled until the form is complete",
  );

  // Exactly the endpoint this screen needs.
  assertEqual(endpoints(), ["/admin/stats"], "dashboard touches stats only");
});

await check("2. stats failure is honest and retry recovers", async () => {
  let failFirst = true;
  await mountDashboard({
    handler: async (endpoint, method) => {
      assertEqual(method, "GET", "stats is a GET");
      if (endpoint !== "/admin/stats") throw new Error(`unexpected ${endpoint}`);
      if (failFirst) {
        failFirst = false;
        throw new Error("network down");
      }
      return STATS;
    },
  });
  await waitFor(
    () => pageText().includes("Stats are unavailable right now."),
    "stats error state",
  );
  assert(
    !pageText().includes("42"),
    "a failed fetch must never render numbers",
  );
  assert(
    !pageText().includes("NaN") && !pageText().includes("undefined"),
    "no placeholder garbage in the error state",
  );

  await click(buttonByText("Try again"), "stats retry");
  await waitFor(() => statsSection()?.textContent.includes("42"), "stats retry");
  assert(statsSection().textContent.includes("16.67%"), "rate after retry");

  const statsCalls = getApiCalls().filter((c) => c.endpoint === "/admin/stats");
  assertEqual(statsCalls.length, 2, "retry issues a second request");
  assertEqual(endpoints(), ["/admin/stats"], "still stats only");
});

await check("3. CSV drop, preview and the create-quiz payload contract", async () => {
  let created = null;
  await mountDashboard({
    handler: async (endpoint, method, body) => {
      if (endpoint === "/admin/stats") return STATS;
      if (endpoint === "/admin/upload-quiz") {
        created = { endpoint, method, body };
        return { success: true };
      }
      throw new Error(`unexpected ${endpoint}`);
    },
  });
  await waitFor(() => statsSection()?.textContent.includes("42"), "stats");

  // Fill the form the way an admin would.
  setValue(
    window.document.getElementById("quiz-technology"),
    "JavaScript",
    "technology input",
  );
  const intermediate = $$("button").find((b) =>
    b.textContent.includes("Intermediate"),
  );
  await click(intermediate, "level option");
  assert(
    intermediate.getAttribute("aria-pressed") === "true",
    "selected level reports aria-pressed",
  );

  // Drop a well-formed CSV on the dropzone.
  const file = new window.File([CSV], "quiz.csv", { type: "text/csv" });
  await dropCsv(file);
  await waitFor(
    () => pageText().includes("1 questions loaded successfully"),
    "CSV toast",
  );
  await waitFor(() => pageText().includes("1 questions loaded"), "loaded chip");
  assert(
    pageText().includes("Preview Questions"),
    "preview opens automatically after a valid drop",
  );
  assert(
    pageText().includes("Correct: A - One"),
    "preview must show the resolved answer",
  );
  assert(pageText().includes("Ready to Submit"), "summary flips to ready");

  const toggle = $$("button").find(
    (b) => b.textContent.replace(/\s+/g, " ").trim() === "Hide Preview",
  );
  assert(toggle, "preview toggle missing");
  assertEqual(toggle.getAttribute("aria-expanded"), "true", "toggle state");

  // Submit and pin the exact payload the backend validates.
  const submit = buttonByText("Create Quiz");
  assert(submit && !submit.disabled, "submit must enable once complete");
  await click(submit, "Create Quiz");

  assert(created, "quiz was not created");
  assertEqual(created.endpoint, "/admin/upload-quiz", "create endpoint");
  assertEqual(created.method, "POST", "create method");
  assertEqual(
    created.body,
    {
      technology: "JavaScript",
      level: "Intermediate",
      timeLimit: 30,
      questions: [
        {
          question: "What is 2 plus 2?",
          options: ["One", "Two", "Three", "Four"],
          answerKey: "A",
          answerText: "One",
        },
      ],
      totalQuestions: 1,
    },
    "create payload shape",
  );
  assert(
    dashboardToastVisible('Quiz "JavaScript" created successfully'),
    "creation feedback must be visible",
  );

  // The API surface used by the dashboard stays exactly these two endpoints.
  assertEqual(
    endpoints().sort(),
    ["/admin/stats", "/admin/upload-quiz"],
    "dashboard endpoints",
  );
});

await check("4. quiz list cards, search and level filters", async () => {
  let delay = 250;
  await mountList({
    handler: async (endpoint, method) => {
      assertEqual(endpoint, "/admin/quizzes", "list endpoint");
      assertEqual(method, "GET", "list method");
      if (delay) {
        const wait = delay;
        delay = 0;
        await tick(wait);
      }
      return { quizzes: QUIZZES };
    },
  });

  // Loading state is real, not a blank flash.
  assert(
    pageText().includes("Loading quizzes…"),
    "loading state must be announced",
  );

  await waitFor(() => pageText().includes("JavaScript"), "cards to render");
  assertEqual($$("h1").map((h) => h.textContent.trim()), ["Quizzes"], "h1");
  assert(pageText().includes(LONG_NAME), "long titles must render");

  // First card: full metadata.
  assert(pageText().includes("15 min"), "time limit shown");
  assert(pageText().includes("Basic"), "level badge shown");
  assert(
    /\d{1,2} Jun, 2025/.test(pageText()),
    "upload date formatted without NaN",
  );

  const cards = quizCards();
  assertEqual(cards.length, 2, "both cards render");
  const longCard = cards.find((c) => c.textContent.includes(LONG_NAME));
  assert(longCard, "long-title card missing");
  assert(
    longCard.textContent.includes("3"),
    "question count falls back to the questions array",
  );
  assert(
    !pageText().includes("NaN") && !pageText().includes("undefined"),
    "missing fields must fall back, never leak NaN/undefined",
  );
  assert(
    longCard.textContent.includes("—"),
    "null time limit/date render as an em dash",
  );

  // Per-card actions are labelled for screen readers.
  assert(
    $$("button").find(
      (b) => b.getAttribute("aria-label") === `View ${"JavaScript"}`,
    ),
    "view action label missing",
  );
  assert(
    $$("button").find(
      (b) => b.getAttribute("aria-label") === `Delete ${"JavaScript"}`,
    ),
    "delete action label missing",
  );

  // Search narrows the list client-side and reports the count.
  const search = window.document.querySelector(
    'input[aria-label="Search quizzes by technology"]',
  );
  assert(search, "search input missing");
  setValue(search, "javascript", "search");
  await waitFor(() => pageText().includes("1 of 2 quizzes"), "result count");
  assert(
    !pageText().includes(LONG_NAME),
    "non-matching cards must be filtered out",
  );

  // A search with no hits explains itself and can be cleared.
  setValue(search, "zzzz", "search");
  await waitFor(
    () => pageText().includes("No quizzes match your filters"),
    "no-match state",
  );
  await click(buttonByText("Clear filters"), "clear filters");
  await waitFor(() => pageText().includes("1 of 2 quizzes") === false, "clear");
  assert(pageText().includes(LONG_NAME), "clearing restores every card");

  // Level filter menu with roving radio semantics.
  const filterButton = $$("button").find(
    (b) => b.getAttribute("aria-haspopup") === "menu",
  );
  assert(filterButton, "filter button missing");
  await click(filterButton, "filter menu");
  assertEqual(filterButton.getAttribute("aria-expanded"), "true", "menu open");
  const menu = window.document.querySelector('[role="menu"]');
  assert(menu, "filter menu missing");
  const advanced = $$('[role="menuitemradio"]', menu).find(
    (b) => b.textContent.trim() === "Advanced",
  );
  await click(advanced, "Advanced filter");
  await waitFor(() => pageText().includes(LONG_NAME), "filtered by level");
  assert(
    !pageText().includes("15 min"),
    "other levels must be filtered out",
  );

  // The list screen only ever talks to its one endpoint.
  assertEqual(endpoints(), ["/admin/quizzes"], "list endpoints");
});

await check("5. list failure shows retry; an empty catalog invites creation", async () => {
  let failFirst = true;
  await mountList({
    handler: async (endpoint) => {
      assertEqual(endpoint, "/admin/quizzes", "list endpoint");
      if (failFirst) {
        failFirst = false;
        throw new Error("server exploded");
      }
      return { quizzes: [] };
    },
  });
  await waitFor(
    () => pageText().includes("Couldn't load your quizzes"),
    "list error state",
  );
  const alertCard = window.document.querySelector('[role="alert"]');
  assert(alertCard, "error must be announced");
  assert(alertCard.textContent.includes("server exploded"), "real message");
  assert(
    !pageText().includes("NaN") && !pageText().includes("undefined"),
    "no garbage in the error state",
  );

  await click(buttonByText("Try again"), "list retry");
  await waitFor(
    () => pageText().includes("No technologies found"),
    "empty state",
  );
  assert(
    pageText().includes("Get Started by creating your first technology quiz."),
    "empty-state copy preserved",
  );
  assert(buttonByText("Create First Quiz"), "creation CTA missing");

  assertEqual(getApiCalls().length, 2, "retry issues a second request");
  assertEqual(endpoints(), ["/admin/quizzes"], "list endpoints");
});

await check("6. delete confirmation, Escape, and visible feedback", async () => {
  let deleteFails = false;
  await mountList({
    handler: async (endpoint, method) => {
      if (endpoint === "/admin/quizzes") return { quizzes: [QUIZZES[0]] };
      if (method === "DELETE" && endpoint === "/admin/quiz/quiz1") {
        if (deleteFails) throw new Error("delete rejected");
        return { success: true };
      }
      throw new Error(`unexpected ${method} ${endpoint}`);
    },
  });
  await waitFor(() => pageText().includes("JavaScript"), "card");

  // Open the dialog.
  await click(buttonByText("Delete"), "card delete");
  const modal = dialog();
  assert(modal, "confirmation dialog must open");
  assertEqual(modal.getAttribute("aria-modal"), "true", "modal semantics");
  assert(modal.getAttribute("aria-labelledby"), "dialog must be labelled");
  assert(
    modal.textContent.includes("Delete Quiz?") &&
      modal.textContent.includes("JavaScript"),
    "dialog names the quiz",
  );
  assert(
    document.activeElement === buttonByText("Cancel", modal),
    "the safe action receives initial focus",
  );

  // Escape cancels without touching the API.
  await pressEscape();
  assert(!dialog(), "Escape must close the dialog");
  assertEqual(
    getApiCalls().filter((c) => c.method === "DELETE").length,
    0,
    "cancelling must not delete",
  );

  // Confirm the delete: exact endpoint, visible success toast, card gone.
  await click(buttonByText("Delete"), "card delete");
  await click(buttonByText("Delete", dialog()), "confirm delete");
  await waitFor(
    () => pageText().includes("Deleted successfully!"),
    "success toast",
  );
  const toast = $$("div").find(
    (d) =>
      d.textContent.includes("Deleted successfully!") &&
      d.getAttribute("role") === "status",
  );
  assert(toast, "success feedback must be rendered and announced");
  assert(!pageText().includes("JavaScript"), "card must be removed");
  assert(pageText().includes("No technologies found"), "now empty");
  const deletes = getApiCalls().filter((c) => c.method === "DELETE");
  assertEqual(deletes.length, 1, "one delete call");
  assertEqual(deletes[0].endpoint, "/admin/quiz/quiz1", "delete endpoint");

  // The toast can be dismissed.
  await click(
    $$("button").find(
      (b) => b.getAttribute("aria-label") === "Dismiss notification",
    ),
    "dismiss toast",
  );
  assert(
    !pageText().includes("Deleted successfully!"),
    "dismiss hides the toast",
  );

  // Failure path: the card stays, the toast announces the error.
  await unmount();
  deleteFails = true;
  await mountList({
    handler: async (endpoint, method) => {
      if (endpoint === "/admin/quizzes") return { quizzes: [QUIZZES[0]] };
      if (method === "DELETE") throw new Error("delete rejected");
      throw new Error(`unexpected ${method} ${endpoint}`);
    },
  });
  await waitFor(() => pageText().includes("JavaScript"), "card");
  await click(buttonByText("Delete"), "card delete");
  await click(buttonByText("Delete", dialog()), "confirm delete");
  await waitFor(() => pageText().includes("Delete failed!"), "failure toast");
  const failureToast = $$("div").find(
    (d) =>
      d.textContent.includes("Delete failed!") &&
      d.getAttribute("role") === "alert",
  );
  assert(failureToast, "error feedback must be rendered and announced");
  assert(pageText().includes("JavaScript"), "failed delete keeps the card");
  assertEqual(
    getApiCalls().filter((c) => c.method === "DELETE").length,
    1,
    "one attempted delete",
  );
});

await check("7. quiz detail: loading, real metadata, error retry, no answer keys", async () => {
  let delay = 250;
  await mountQuizPage({
    handler: async (endpoint, method) => {
      assertEqual(endpoint, "/admin/quiz/quiz1", "detail endpoint");
      assertEqual(method, "GET", "detail method");
      if (delay) {
        const wait = delay;
        delay = 0;
        await tick(wait);
      }
      return { quiz: QUIZ_DETAIL };
    },
  });
  assert(pageText().includes("Loading quiz…"), "loading state announced");

  await waitFor(() => pageText().includes("JavaScript"), "detail to render");
  assertEqual(
    $$("h1").map((h) => h.textContent.trim()),
    ["JavaScript"],
    "quiz title heading",
  );
  assert(pageText().includes("Basic"), "level badge");
  assert(pageText().includes("Questions") && pageText().includes("5"), "count");
  assert(pageText().includes("Time limit") && pageText().includes("10 min"), "time");
  assert(/Uploaded.*2025/.test(pageText()), "upload date");
  assert(
    $$("a").filter((a) => a.textContent.includes("Back to quizzes")).length >= 1,
    "back navigation missing",
  );

  // The detail screen must never leak answer material.
  const text = pageText();
  assert(!text.includes("answerKey"), "no raw answer keys");
  assert(!text.includes("answerText"), "no raw answer texts");
  assert(!text.includes("What is a closure?"), "question bank is not rendered here");
  assert(
    !text.includes("NaN") && !text.includes("undefined"),
    "no garbage values",
  );
  assertEqual(endpoints(), ["/admin/quiz/quiz1"], "detail endpoints");

  // Error + retry.
  await unmount();
  let failFirst = true;
  await mountQuizPage({
    handler: async (endpoint) => {
      assertEqual(endpoint, "/admin/quiz/quiz1", "detail endpoint");
      if (failFirst) {
        failFirst = false;
        throw new Error("Quiz not found");
      }
      return { quiz: QUIZ_DETAIL };
    },
  });
  await waitFor(
    () => pageText().includes("Couldn't load this quiz"),
    "detail error state",
  );
  const alertCard = window.document.querySelector('[role="alert"]');
  assert(alertCard && alertCard.textContent.includes("Quiz not found"), "real message");

  await click(buttonByText("Try again"), "detail retry");
  await waitFor(() => pageText().includes("JavaScript"), "detail after retry");
  assertEqual(getApiCalls().length, 2, "retry issues a second request");
});

await check("8. list duplicate clones server-side and refreshes the catalog", async () => {
  let listCalls = 0;
  await mountList({
    handler: async (endpoint, method) => {
      if (endpoint === "/admin/quizzes" && method === "GET") {
        listCalls++;
        const copy = {
          ...QUIZZES[0],
          _id: "quiz9",
          technology: "JavaScript (copy)",
        };
        return { quizzes: listCalls === 1 ? [QUIZZES[0]] : [QUIZZES[0], copy] };
      }
      if (
        endpoint === "/admin/quiz/quiz1/duplicate" &&
        method === "POST"
      ) {
        return { success: true, quiz: { _id: "quiz9" } };
      }
      throw new Error(`unexpected ${method} ${endpoint}`);
    },
  });
  await waitFor(() => pageText().includes("JavaScript"), "card");

  const duplicate = $$("button").find(
    (b) => b.getAttribute("aria-label") === "Duplicate JavaScript",
  );
  assert(duplicate, "duplicate action label missing");
  await click(duplicate, "duplicate");
  await waitFor(
    () => pageText().includes("duplicated successfully"),
    "duplicate toast",
  );
  const toast = $$("div").find(
    (d) =>
      d.getAttribute("role") === "status" &&
      d.textContent.includes("duplicated successfully"),
  );
  assert(toast, "duplicate success must be announced");
  await waitFor(
    () => pageText().includes("JavaScript (copy)"),
    "catalog to refetch",
  );

  const posts = getApiCalls().filter((c) => c.method === "POST");
  assertEqual(posts.length, 1, "one duplicate call");
  assertEqual(
    posts[0].endpoint,
    "/admin/quiz/quiz1/duplicate",
    "duplicate endpoint",
  );
  assertEqual(listCalls, 2, "catalog refetched after duplicate");
});

await check("9. quiz detail duplicate opens the server-side copy", async () => {
  const COPY = {
    ...QUIZ_DETAIL,
    _id: "quiz9",
    technology: "JavaScript (copy)",
  };
  await mountQuizPage({
    handler: async (endpoint, method) => {
      if (method === "GET" && endpoint === "/admin/quiz/quiz1") {
        return { quiz: QUIZ_DETAIL };
      }
      if (method === "POST" && endpoint === "/admin/quiz/quiz1/duplicate") {
        return { success: true, quiz: { _id: "quiz9" } };
      }
      if (method === "GET" && endpoint === "/admin/quiz/quiz9") {
        return { quiz: COPY };
      }
      throw new Error(`unexpected ${method} ${endpoint}`);
    },
  });
  await waitFor(() => pageText().includes("JavaScript"), "detail");

  const duplicate = buttonByText("Duplicate quiz");
  assert(duplicate, "duplicate button missing");
  await click(duplicate, "duplicate quiz");
  await waitFor(
    () => pageText().includes("JavaScript (copy)"),
    "copy detail to open",
  );
  assertEqual(
    $$("h1").map((h) => h.textContent.trim()),
    ["JavaScript (copy)"],
    "copy heading",
  );

  const posts = getApiCalls().filter((c) => c.method === "POST");
  assertEqual(posts.length, 1, "one duplicate call");
  assertEqual(
    posts[0].endpoint,
    "/admin/quiz/quiz1/duplicate",
    "duplicate endpoint",
  );
  assert(
    !pageText().includes("answerKey"),
    "no answer keys leak in the copy flow",
  );
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
