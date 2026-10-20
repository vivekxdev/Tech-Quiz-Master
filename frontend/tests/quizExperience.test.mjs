// Phase 2 / Step 7 quiz-experience harness.
//
// Renders the real <Sidebar/> (through Vite's SSR module loader so the JSX
// source runs unmodified) inside jsdom, with Clerk and the HTTP client
// replaced by the stubs in ./harness. It covers the redesigned experience
// screens: difficulty cards with real catalog/progress data and unavailable
// levels, the start screen (no invented time limits, sign-in note, distinct
// Resume/Start New actions), and the active quiz (selected answer states,
// navigator labels and answered coloring, timer legibility) plus the
// submission feedback and the results-screen restart dialog (cancel and
// confirm).
//
// Run:  node tests/quizExperience.test.mjs      (from the frontend directory)

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

// A level with zero questions and one with no time limit: both are legal
// catalog shapes the UI must describe honestly instead of inventing data.
const DEGRADED_CATALOG = {
  quizzes: CATALOG.quizzes.map((quiz) => {
    if (quiz.technology === "JavaScript" && quiz.level === "basic") {
      return { ...quiz, questions: [], timeLimit: 0 };
    }
    return quiz;
  }),
};

// Questions exist but the catalog carries no time limit at all.
const NO_TIME_CATALOG = {
  quizzes: CATALOG.quizzes.map((quiz) => {
    if (quiz.technology === "JavaScript" && quiz.level === "basic") {
      return { ...quiz, timeLimit: 0 };
    }
    return quiz;
  }),
};

const buildSubmissionResponse = (payload) => {
  const selectedAnswers = {};
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;

  (payload.answers || []).forEach((answer, index) => {
    const chosen = answer.selectedAnswer;
    const correctAnswer = 0; // fixture rule: option 0 is always correct
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

const defaultHandler = async (endpoint, method, body) => {
  if (endpoint === "/admin/quizzes") return CATALOG;
  if (endpoint === "/results/create") return buildSubmissionResponse(body);
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

const clearIntervals = () => {
  for (const id of [...liveOneSecondIntervals]) {
    liveOneSecondIntervals.delete(id);
    nativeClearInterval(id);
  }
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
  clearIntervals();
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

const aside = () => window.document.querySelector("aside");
const main = () => window.document.querySelector("main");
const dialog = () => window.document.querySelector("div.fixed");

const click = async (element, label = "element") => {
  assert(element, `could not find ${label}`);
  element.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  await flush();
};

const clickTech = (name) => {
  const wrapper = $$("div[data-tech]", aside()).find((d) =>
    [...d.children].some(
      (child) =>
        child.tagName === "BUTTON" &&
        child.textContent.trim().startsWith(name),
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

// Difficulty card in the main region (the level list lives there now).
const levelCard = (name) =>
  $$("button", main()).find((b) => b.textContent.includes(name));

const selectLevel = async (tech, level) => {
  await clickTech(tech);
  await clickLevel(level);
};

const pageText = () => window.document.body.textContent.replace(/\s+/g, " ");

const waitFor = async (predicate, label, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await tick(25);
  assert(predicate(), `timed out waiting for ${label}`);
};

const optionByLabel = (label) =>
  $$("button", main()).find((b) => {
    const aria = b.getAttribute("aria-label") || "";
    return aria === label || aria.startsWith(`${label},`);
  });

const navigatorButtons = () =>
  $$("button", main()).filter((b) =>
    (b.getAttribute("aria-label") || "").startsWith("Go to question "),
  );

const timerPill = () => window.document.querySelector('[role="timer"]');

const seededAttempt = (overrides = {}) => ({
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
        ...overrides,
      },
    },
  },
});

// ---------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------

console.log(
  "\n=== Tech Quiz Master - Phase 2 Step 7 quiz experience harness ===\n",
);

await check("1. difficulty cards show real catalog data and no invented progress", async () => {
  await mount();
  await clickTech("JavaScript");

  assert(pageText().includes("JavaScript Quiz"), "difficulty screen title missing");
  assert(
    pageText().includes("Select a difficulty level to begin your challenge"),
    "difficulty subtitle missing",
  );

  const basic = levelCard("Basic");
  const intermediate = levelCard("Intermediate");
  assert(basic, "Basic difficulty card missing");
  assert(intermediate, "Intermediate difficulty card missing");
  assert(basic.textContent.includes("5 Qs"), "real question count missing");
  assert(basic.textContent.includes("10m"), "real time limit missing");
  assert(intermediate.textContent.includes("3 Qs"), "intermediate count missing");
  assert(!basic.textContent.includes("Completed"), "no completion may be claimed without data");
  assert(!basic.textContent.includes("answered"), "no answered pill may appear without data");
  assert(!pageText().includes("undefined"), "difficulty screen leaked `undefined`");

  await click(basic, "Basic difficulty card");
  assert(pageText().includes("Ready to Start?"), "card selection must reach the start screen");
  assert(buttonByText("Start Quiz", main()), "Start Quiz missing after card selection");
  await unmount();
});

await check("2. saved progress appears on the matching difficulty card only", async () => {
  await mount({ storage: seededAttempt() });
  await clickTech("JavaScript");

  const basic = levelCard("Basic");
  const intermediate = levelCard("Intermediate");
  assert(basic && intermediate, "difficulty cards missing");
  assert(basic.textContent.includes("5/5 answered"), "answered pill missing on saved level");
  assert(basic.textContent.includes("Completed"), "completed pill missing on finished level");
  assert(
    !intermediate.textContent.includes("answered"),
    "levels without records must show no progress",
  );
  assert(
    !intermediate.textContent.includes("Completed"),
    "levels without records must never read Completed",
  );
  await unmount();
});

await check("3. zero-question levels are unavailable and cannot be started", async () => {
  const handler = async (endpoint) => {
    if (endpoint === "/admin/quizzes") return DEGRADED_CATALOG;
    if (endpoint === "/results/my-results") return [];
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
  await mount({ handler });
  await clickTech("JavaScript");

  const basic = levelCard("Basic");
  const intermediate = levelCard("Intermediate");
  assert(basic, "Basic card missing");
  assert(basic.disabled, "a zero-question level must render disabled");
  assert(basic.textContent.includes("No questions yet"), "unavailable label missing");

  await click(basic, "disabled Basic card");
  assert(
    !pageText().includes("Ready to Start?"),
    "a disabled level must not start",
  );

  const railBasic = $$("button", aside()).find((b) =>
    b.textContent.includes("Basic"),
  );
  assert(railBasic && railBasic.disabled, "the rail entry must be disabled too");

  assert(intermediate && !intermediate.disabled, "levels with questions stay usable");
  await click(intermediate, "Intermediate difficulty card");
  assert(pageText().includes("Ready to Start?"), "usable level must still start");
  await unmount();
});

await check("4. the start screen never invents a time limit and notes signed-out", async () => {
  const handler = async (endpoint) => {
    if (endpoint === "/admin/quizzes") return NO_TIME_CATALOG;
    if (endpoint === "/results/my-results") return [];
    throw new Error(`unexpected endpoint ${endpoint}`);
  };
  await mount({ handler, signedIn: false });
  await selectLevel("JavaScript", "Basic");

  assert(pageText().includes("Ready to Start?"), "start screen missing");
  assert(pageText().includes("Questions"), "question stat missing");
  assert(!pageText().includes("Time Limit"), "a missing time limit must not render a stat");
  assert(!pageText().includes("0 min"), "an empty limit must never read 0 min");
  assert(
    pageText().includes("You'll be asked to sign in before the quiz starts."),
    "signed-out note missing",
  );
  assert(buttonByText("Start Quiz", main()), "Start Quiz must still be offered");
  await unmount();

  await mount();
  await selectLevel("JavaScript", "Intermediate");
  assert(
    !pageText().includes("You'll be asked to sign in before the quiz starts."),
    "signed-in users must not see the sign-in note",
  );
  await unmount();
});

await check("5. Resume and Start New stay distinct with honest captions", async () => {
  await mount({ storage: seededAttempt() });
  await clickTech("JavaScript");
  await clickLevel("Basic");

  assert(pageText().includes("Ready to Start?"), "start screen missing");
  assert(buttonByText("Resume Quiz", main()), "Resume Quiz missing");
  assert(buttonByText("Start New Quiz", main()), "Start New Quiz missing");
  assert(
    pageText().includes("Resume keeps your saved answers and remaining time"),
    "resume caption missing",
  );
  assert(
    pageText().includes("Start new replaces your saved attempt"),
    "start-new caption missing",
  );
  await unmount();

  await mount();
  await selectLevel("JavaScript", "Intermediate");
  assert(
    !pageText().includes("Resume keeps your saved answers"),
    "resume captions belong only to a resumable attempt",
  );
  assert(
    !pageText().includes("Start new replaces"),
    "start-new caption belongs only to a resumable attempt",
  );
  await unmount();
});

await check("6. choosing an answer renders an unmistakable selected state", async () => {
  await mount();
  await selectLevel("JavaScript", "Intermediate");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");

  const alpha = optionByLabel("Alpha");
  const bravo = optionByLabel("Bravo");
  assert(alpha && bravo, "answer options missing");
  assertEqual(alpha.getAttribute("aria-pressed"), "false", "option must start unpressed");
  assert(
    alpha.className.includes("border-line"),
    "unselected option must use the neutral border",
  );

  await click(buttonByText("Alpha", main()), "Alpha option");
  assertEqual(optionByLabel("Alpha").getAttribute("aria-pressed"), "true", "selected option must be pressed");
  assert(
    optionByLabel("Alpha").className.includes("border-brand-300"),
    "selected option lost its canonical border",
  );
  assert(
    optionByLabel("Alpha").className.includes("ring-brand-200"),
    "selected option needs the ring for clearer contrast",
  );
  assertEqual(
    optionByLabel("Alpha").getAttribute("aria-label"),
    "Alpha, your answer",
    "selected option label must say whose answer it is",
  );
  assertEqual(optionByLabel("Bravo").getAttribute("aria-pressed"), "false", "other options must stay unpressed");
  await unmount();
});

await check("7. the navigator is labelled, colour-coded and jumps between questions", async () => {
  await mount();
  await selectLevel("JavaScript", "Intermediate");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");

  const buttons = navigatorButtons();
  assertEqual(buttons.length, 3, "one navigator button per question");
  assert(pageText().includes("Question 1 of 3"), "initial question badge missing");
  assert(
    buttons[0].getAttribute("aria-label").startsWith("Go to question 1"),
    "navigator labels must start with the question number",
  );
  assert(
    buttons[0].getAttribute("aria-label").includes(", current question"),
    "the current question must be announced",
  );
  assertEqual(buttons[0].getAttribute("aria-current"), "step", "current question needs aria-current");
  assert(
    !buttons[0].className.includes("border-brand-300"),
    "an unanswered question must not look answered",
  );

  await click(buttonByText("Alpha", main()), "answer question 1");
  assert(
    navigatorButtons()[0].className.includes("border-brand-300"),
    "answered questions must change colour",
  );

  await click(navigatorButtons()[2], "question 3");
  assert(pageText().includes("Question 3 of 3"), "jump must update the badge");
  assertEqual(
    navigatorButtons()[2].getAttribute("aria-current"),
    "step",
    "the jumped-to question becomes current",
  );
  assert(
    navigatorButtons()[0].getAttribute("aria-label") === "Go to question 1",
    "the previous question must no longer claim current",
  );
  await unmount();
});

await check("8. the timer is legible, monospaced and announced", async () => {
  await mount();
  await selectLevel("JavaScript", "Intermediate");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");

  const pill = timerPill();
  assert(pill, "timer pill missing");
  assert(
    pill.getAttribute("aria-label").startsWith("Time remaining "),
    "timer must be announced with its remaining time",
  );

  const label = pill.querySelector("span");
  assert(label, "timer text missing");
  assert(/^\d{2}:\d{2}$/.test(label.textContent.trim()), "timer must read MM:SS");
  assert(label.className.includes("font-mono"), "timer must use tabular monospaced digits");

  const firstOnPage = (pageText().match(/\d{2}:\d{2}/) || [])[0];
  assertEqual(
    firstOnPage,
    label.textContent.trim(),
    "the timer must be the first MM:SS the page shows",
  );
  await unmount();
});

await check("9. submission feedback and the restart dialog (cancel and confirm)", async () => {
  await mount();
  await selectLevel("JavaScript", "Intermediate");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  await click(buttonByText("Alpha", main()), "answer question 1");

  await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");
  await click(buttonByText("Submit Quiz", dialog()), "confirm submit");
  await waitFor(() => pageText().includes("Quiz Completed!"), "submission feedback");
  assertEqual(getApiCalls().filter((c) => c.endpoint === "/results/create").length, 1, "exactly one submission");

  // Cancel keeps the results on screen.
  await click(buttonByText("Restart Quiz", main()), "Restart Quiz on results");
  assert(dialog(), "restart dialog missing");
  assert(
    dialog().textContent.includes("Timer will start fresh"),
    "restart dialog must explain what is lost",
  );
  await click(buttonByText("Cancel", dialog()), "cancel restart");
  assert(!dialog(), "cancel must close the dialog");
  assert(pageText().includes("Quiz Completed!"), "cancel must keep the results");

  // Confirm resets the attempt and lands back on the start screen.
  await click(buttonByText("Restart Quiz", main()), "Restart Quiz on results");
  await click(buttonByText("Restart Quiz", dialog()), "confirm restart");
  assert(!dialog(), "confirm must close the dialog");
  assert(pageText().includes("Ready to Start?"), "restart must return to the start screen");
  assert(buttonByText("Start Quiz", main()), "fresh Start Quiz missing after restart");

  const record = readStorage()?.progressByTech?.javascript?.intermediate;
  assert(record, "restart must persist a fresh record");
  assertEqual(record.userAnswers, {}, "restart must clear saved answers");
  assertEqual(record.isQuizStarted, false, "restart must leave the quiz stopped");
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
