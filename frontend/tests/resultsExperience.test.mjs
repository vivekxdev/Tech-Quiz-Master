// Phase 2 / Step 8: premium results, history & answer-review harness.
//
// Renders the real <MyResult/> and <Sidebar/> through Vite's SSR module
// loader so the JSX source runs unmodified, with Clerk and the HTTP client
// replaced by the shared harness stubs. It covers the Step 8 result/review
// work on top of the existing suites:
//   - malformed dates/times can never render NaN or Invalid Date
//   - history-card metadata rows and the scored percent announcement
//   - performance-summary structure plus the new tone classes
//   - honest labels for unanswered review entries
//   - the review dialog's real Tab focus trap
//   - the in-app quiz-completion screen's aria hierarchy and card tones
//
// Run:  node tests/resultsExperience.test.mjs      (from the frontend directory)

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
globalThis.__alerts = [];
defineGlobal("alert", (message) => {
  globalThis.__alerts.push(String(message));
});

window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
window.Element.prototype.scrollIntoView = function scrollIntoView() {};

// The quiz timer is the only 1-second interval in the app; track it so an
// active-quiz check cannot leave the process hanging on a live interval.
const liveOneSecondIntervals = new Set();
const nativeSetInterval = globalThis.setInterval;
const nativeClearInterval = globalThis.clearInterval;
defineGlobal("setInterval", (handler, timeout, ...args) => {
  const id = nativeSetInterval(handler, timeout, ...args);
  if (Number(timeout) === 1000) liveOneSecondIntervals.add(id);
  return id;
});
defineGlobal("clearInterval", (id) => {
  liveOneSecondIntervals.delete(id);
  return nativeClearInterval(id);
});

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
// fixtures: real-shaped result rows (what GET /results/my-results returns)
// ---------------------------------------------------------------------------
const snapshot = (correct, total) =>
  Array.from({ length: total }, (_, index) => ({
    questionId: `656f000000000000000000q${index}`,
    question: `Question ${index + 1}?`,
    options: ["Alpha", "Bravo", "Charlie", "Delta"],
    selectedAnswer: index < correct ? 0 : 1,
    correctAnswer: 0,
    isCorrect: index < correct,
  }));

const historyRow = ({
  month = "06",
  correct = 9,
  timeTaken = 60,
  startDate = `2025-${month}-01T12:00:00.000Z`,
  createdAt = `2025-${month}-01T12:00:00.000Z`,
  selectedAnswers = snapshot(correct, 10),
} = {}) => ({
  _id: `row-${month}-${correct}`,
  userId: "clerk_test",
  userName: "Tester",
  userEmail: "t@test.local",
  technology: "javascript",
  level: "basic",
  totalQuestions: 10,
  correctAnswers: correct,
  score: correct,
  timeTaken,
  startDate,
  createdAt,
  selectedAnswers,
});

// Newest first: three strong recent attempts over three weak early ones,
// matching the trend fixture the Step 5 suite established.
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

// In-app quiz fixture: 3 questions, option 0 always correct.
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

const buildSubmissionResponse = (payload) => {
  const selectedAnswers = {};
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;

  (payload.answers || []).forEach((answer, index) => {
    const chosen = answer.selectedAnswer;
    const correctAnswer = 0;
    const isAttempted = chosen !== -1;
    const isCorrect = isAttempted && chosen === correctAnswer;
    if (!isAttempted) unattempted += 1;
    else if (isCorrect) correct += 1;
    else wrong += 1;
    selectedAnswers[index] = {
      selectedAnswer: chosen,
      correctAnswer,
      isCorrect,
    };
  });

  const total = (payload.answers || []).length;
  return {
    summary: {
      correctAnswers: correct,
      wrongAnswers: wrong,
      unattempted,
      totalQuestions: total,
      percentage: total ? Math.round((correct / total) * 100) : 0,
    },
    result: { selectedAnswers },
  };
};

const quizHandler = async (endpoint, method, body) => {
  if (endpoint === "/admin/quizzes") return CATALOG;
  if (endpoint === "/results/create") return buildSubmissionResponse(body);
  // Sidebar loads the personal history for its dashboard panel.
  if (endpoint === "/results/my-results") return [];
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
const { setSignedIn, resetClerkStub } = await server.ssrLoadModule(
  "/tests/harness/clerkStub.mjs",
);

const { default: MyResult } = await server.ssrLoadModule(
  "/src/components/MyResult.jsx",
);
const { default: Sidebar } = await server.ssrLoadModule(
  "/src/components/Sidebar.jsx",
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

const clearIntervals = () => {
  for (const id of [...liveOneSecondIntervals]) {
    liveOneSecondIntervals.delete(id);
    nativeClearInterval(id);
  }
};

async function mountMyResult({ handler } = {}) {
  resetApiStub();
  resetClerkStub();
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

async function mountSidebar({ handler } = {}) {
  resetApiStub();
  resetClerkStub();
  setSignedIn(true);
  setRequestHandler(handler || quizHandler);
  window.localStorage.clear();

  container = window.document.createElement("div");
  window.document.body.appendChild(container);
  root = createRoot(container);
  // Sidebar now carries an in-app <Link> (performance snapshot → /result),
  // so the mount needs the same Router context as mountMyResult.
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
  clearIntervals();
  window.localStorage.clear();
  resetApiStub();
  resetClerkStub();
  globalThis.__alerts.length = 0;
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

const main = () => window.document.querySelector("main");
const aside = () => window.document.querySelector("aside");

// Leaf node (no child elements) carrying exactly this label text.
const leafBy = (label, scope, tag = "*") =>
  $$(tag, scope).find(
    (node) => node.children.length === 0 && node.textContent.trim() === label,
  );

// The meta row renders [label, value] pairs; return the value for a label.
const metaValue = (card, label) => {
  const labelEl = leafBy(label, card, "div");
  assert(labelEl, `meta label missing: ${label}`);
  assertEqual(labelEl.parentElement.children.length, 2, `${label} needs one value`);
  return labelEl.parentElement.children[1].textContent.trim();
};

const summaryTileValue = (label) => {
  const heading = $$("h2").find(
    (el) => el.textContent.trim() === "Performance summary",
  );
  assert(heading, "performance summary heading missing");
  const section = heading.closest("section");
  const labelEl = leafBy(label, section, "div");
  assert(labelEl, `tile label missing: ${label}`);
  return labelEl.parentElement.children[1];
};

const openFirstReview = async () => {
  await click(buttonByText("Review answers"), "review button");
  const panel = dialog();
  assert(panel, "review dialog must open");
  return panel;
};

// Sidebar helpers (mirror the Step 7 harness).
const clickTech = (name) => {
  const wrapper = $$("div[data-tech]", aside()).find((d) =>
    [...d.children].some(
      (child) =>
        child.tagName === "BUTTON" && child.textContent.trim().startsWith(name),
    ),
  );
  const btn =
    wrapper &&
    [...wrapper.children].find(
      (child) =>
        child.tagName === "BUTTON" && child.textContent.trim().startsWith(name),
    );
  return click(btn, `tech ${name}`);
};

const clickLevel = (name) => {
  const btn = $$("button", aside()).find((b) => b.textContent.includes(name));
  return click(btn, `level ${name}`);
};

const selectLevel = async (tech, level) => {
  await clickTech(tech);
  await clickLevel(level);
};

const optionByLabel = (label) =>
  $$("button", main()).find((b) => {
    const aria = b.getAttribute("aria-label") || "";
    return aria === label || aria.startsWith(`${label},`);
  });

// ---------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------
console.log(
  "\n=== Tech Quiz Master - Phase 2 Step 8 results & review experience ===\n",
);

await check("1. malformed dates and times never render NaN or Invalid Date", async () => {
  const garbage = historyRow({
    month: "06",
    correct: 7,
    timeTaken: "nonsense",
    startDate: "not-a-date",
    createdAt: "also-not-a-date",
  });
  await mountMyResult({ handler: okHandler([garbage]) });
  await waitFor(() => cards().length === 1, "corrupt row to render");

  const text = pageText();
  assert(!text.includes("NaN"), "NaN leaked into the history page");
  assert(!text.includes("Invalid Date"), "Invalid Date leaked into the history page");
  assert(!text.includes("undefined"), "undefined leaked into the history page");

  const card = cards()[0];
  assertEqual(metaValue(card, "Date"), "—", "unparseable date must fall back");
  assertEqual(metaValue(card, "Time Taken"), "0s", "unparseable time must fall back");
  assertEqual(metaValue(card, "Started At"), "—", "unparseable start time must fall back");

  const panel = await openFirstReview();
  assert(
    panel.textContent.includes("Completed attempt · date unavailable"),
    `corrupt dates must read honestly, got: ${panel.textContent.slice(0, 200)}`,
  );
  assert(!pageText().includes("Invalid Date"), "Invalid Date leaked into the dialog");
  assert(!pageText().includes("NaN"), "NaN leaked into the dialog");
});

await check("2. history cards expose labelled metadata and the scored percent", async () => {
  await mountMyResult({ handler: okHandler([historyRow({ month: "06", correct: 9 })]) });
  await waitFor(() => cards().length === 1, "card to render");

  const card = cards()[0];

  // The meta row keeps its three labelled pairs in order with real values.
  const dateEl = leafBy("Date", card, "div");
  assert(dateEl, "Date label missing");
  const metaRow = dateEl.parentElement.parentElement;
  const labels = [...metaRow.children].map(
    (item) => item.children[0].textContent.trim(),
  );
  assertEqual(labels, ["Date", "Time Taken", "Started At"], "meta row order");
  for (const label of labels) {
    const value = metaValue(card, label);
    assert(value && value !== "—", `${label} must show a real value`);
  }

  // The percent is announced for assistive tech, not just coloured.
  const percent = card.querySelector('[aria-label="90% score"]');
  assert(percent, "scored percent must carry an accessible label");
});

await check("3. the performance summary keeps its structure and gains tones", async () => {
  await mountMyResult({ handler: okHandler(SIX_ROWS) });
  await waitFor(() => summaryTileValue("Total attempts"), "summary to render");

  const attempts = summaryTileValue("Total attempts");
  assertEqual(attempts.textContent.trim(), "6", "attempt count unchanged");
  assert(attempts.className.includes("text-ink"), "neutral tiles keep the ink colour");

  const trend = summaryTileValue("Recent trend");
  assertEqual(trend.textContent.trim(), "↑ +80%", "trend value unchanged");
  assert(
    trend.className.includes("text-success"),
    "an upward trend must be toned as a gain",
  );

  // The trend placeholder below the minimum stays muted, still honest.
  await unmount();
  await mountMyResult({ handler: okHandler(SIX_ROWS.slice(0, 3)) });
  await waitFor(() => summaryTileValue("Recent trend"), "short summary to render");

  const placeholder = summaryTileValue("Recent trend");
  assertEqual(placeholder.textContent.trim(), "—", "no fabricated trend");
  assert(
    placeholder.className.includes("text-ink-2"),
    "an unavailable trend must read as muted",
  );

  // Structure: every tile is exactly [label, value, sub].
  const heading = $$("h2").find((el) => el.textContent.trim() === "Performance summary");
  const labelEl = leafBy("Total attempts", heading.closest("section"), "div");
  assertEqual(labelEl.parentElement.children.length, 3, "tile is label/value/sub");
});

await check("4. unanswered review entries read as Unanswered, with honest labels", async () => {
  const entries = [
    {
      questionId: "656f000000000000000000q0",
      question: "Question 1?",
      options: ["Alpha", "Bravo", "Charlie", "Delta"],
      selectedAnswer: -1,
      correctAnswer: 0,
      isCorrect: false,
    },
    {
      questionId: "656f000000000000000000q1",
      question: "Question 2?",
      options: ["Alpha", "Bravo", "Charlie", "Delta"],
      selectedAnswer: 1,
      correctAnswer: 0,
      isCorrect: false,
    },
  ];
  await mountMyResult({
    handler: okHandler([historyRow({ month: "06", correct: 0, selectedAnswers: entries })]),
  });
  await waitFor(() => cards().length === 1, "row to render");

  const panel = await openFirstReview();
  assert(panel.textContent.includes("Question 1?"), "question text missing");
  assert(
    panel.textContent.includes("Unanswered"),
    "a skipped question must say so",
  );
  assert(
    panel.textContent.includes("Correct answer"),
    "the correct option must still be labelled",
  );
  assert(
    !panel.textContent.includes("Your answer · Correct"),
    "no pick can be celebrated as correct",
  );
  assert(
    panel.textContent.includes("0/10 · 0%"),
    "the dialog must show the real score and percent",
  );
});

await check("5. the review dialog traps Tab inside its panel", async () => {
  await mountMyResult({ handler: okHandler([historyRow({ month: "06" })]) });
  await waitFor(() => cards().length === 1, "row to render");

  const panel = await openFirstReview();
  const focusables = $$(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    panel,
  );
  assert(focusables.length >= 2, "the panel needs focusable controls");
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  last.focus();
  assert(document.activeElement === last, "last control must be focusable");
  last.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
  );
  assert(
    document.activeElement === first,
    "Tab on the last control must wrap to the first",
  );

  first.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  assert(
    document.activeElement === last,
    "Shift+Tab on the first control must wrap to the last",
  );
});

await check("6. the in-app results screen keeps its hierarchy and card tones", async () => {
  await mountSidebar();
  await selectLevel("JavaScript", "Intermediate");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  await click(buttonByText("Alpha", main()), "answer question 1");

  await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");
  await click(buttonByText("Submit Quiz", window.document.querySelector("div.fixed")), "confirm submit");
  await waitFor(() => pageText().includes("Quiz Completed!"), "results screen");

  // Hierarchy: exactly one results heading, real score, honest time.
  const headings = $$("h2", main()).filter(
    (h) => h.textContent.trim() === "Quiz Completed!",
  );
  assertEqual(headings.length, 1, "one results heading");
  assert(pageText().includes("Time Taken:"), "elapsed time must be shown");
  assert(/\d{2}:\d{2}/.test(pageText()), "elapsed time must read as MM:SS");
  assert(!pageText().includes("Score unavailable"), "a saved score must not read as missing");
  assert(!pageText().includes("NaN"), "NaN leaked into the results screen");
  assert(!pageText().includes("undefined"), "undefined leaked into the results screen");

  // Score cards: visible text carries the meaning; tone classes reinforce it.
  const cardsSpec = [
    { label: "Correct Answers", value: "1", tone: "bg-emerald-50" },
    { label: "Incorrect Answers", value: "0", tone: "bg-red-50" },
    { label: "Unattempted", value: "2", tone: "bg-surface-2" },
  ];
  for (const spec of cardsSpec) {
    const labelEl = leafBy(spec.label, main(), "p");
    assert(labelEl, `${spec.label} must be visible text`);
    const cardEl = labelEl.parentElement;
    assert(
      cardEl.className.includes(spec.tone),
      `${spec.label} must carry its tone class`,
    );
    assertEqual(
      labelEl.previousElementSibling.textContent.trim(),
      spec.value,
      `${spec.label} must show the real count`,
    );
    const icon = cardEl.querySelector("svg");
    assert(icon, `${spec.label} card keeps its icon`);
    assertEqual(
      icon.getAttribute("aria-hidden"),
      "true",
      "icons are decoration only, the label carries the meaning",
    );
  }

  // The overall score bar is announced, not just drawn.
  const bar = main().querySelector('[aria-label="Overall score"]');
  assert(bar, "overall score must be accessible");
  assertEqual(bar.getAttribute("role"), "progressbar", "score bar role");
  assertEqual(bar.getAttribute("aria-valuenow"), "33", "real score percentage");

  // The results actions all stay present.
  assert(buttonByText("Review Questions", main()), "Review Questions missing");
  assert(buttonByText("Restart Quiz", main()), "Restart Quiz missing");
  assert(buttonByText("Back to Home", main()), "Back to Home missing");

  // Exactly the endpoints this flow needs, nothing else.
  const endpoints = [...new Set(getApiCalls().map((call) => call.endpoint))].sort();
  assertEqual(
    endpoints,
    ["/admin/quizzes", "/results/create", "/results/my-results"],
    "no other endpoints touched",
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
