// Phase 2 / Step 1 flow harness.
//
// Renders the real <Sidebar/> (through Vite's SSR module loader so the JSX
// source runs unmodified) inside jsdom, with Clerk and the HTTP client
// replaced by the stubs in ./harness. It exercises the Resume Quiz / Start New
// Quiz choice end to end: start screen decisions, Home, resume, restart,
// persistence, timer interval ownership, submission request counts and
// corrupted storage.
//
// Run:  node tests/quizFlow.test.mjs      (from the frontend directory)

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
    // A failing scenario must not leave a mounted root (and its timer
    // interval) alive, otherwise it corrupts the scenarios after it.
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

// The quiz timer is the only 1-second interval in the app, so tracking those
// is a precise way to assert "exactly one timer interval is alive".
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

const catalogHandler = async (endpoint, method, body) => {
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

// The stubs must come from Vite's module graph so Sidebar and the harness talk
// to the same instance.
const {
  setRequestHandler,
  resetApiStub,
  getApiCalls,
} = await server.ssrLoadModule("/tests/harness/apiStub.mjs");
const {
  setSignedIn,
  resetClerkStub,
  getOpenSignInCalls,
} = await server.ssrLoadModule("/tests/harness/clerkStub.mjs");

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
  setRequestHandler(handler || catalogHandler);
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

const buttonContaining = (text, scope = window.document) =>
  $$("button", scope).find((b) => b.textContent.includes(text));

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
  // data-tech lives on a wrapper <div>; the clickable button is its child.
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
  const btn = $$("button", aside()).find((b) =>
    b.textContent.includes(name),
  );
  return click(btn, `level ${name}`);
};

// The app boots on Home: pick a tech and a level to reach the start screen.
const selectLevel = async (tech, level) => {
  await clickTech(tech);
  await clickLevel(level);
};

const clickHome = () => {
  const heading = $$("h1").find((h) =>
    h.textContent.includes("Tech Quiz Master"),
  );
  const target = heading && heading.closest('[class*="cursor-pointer"]');
  return click(target, "Home logo");
};

const pageText = () => window.document.body.textContent.replace(/\s+/g, " ");

const recordFor = (storage, tech, level) =>
  storage?.progressByTech?.[tech]?.[level] || null;

// Attempt identity: a UUID v4, as minted by utils/quizAttempt.js.
const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );

const seededAttempt = (overrides = {}) => ({
  currentTech: "javascript",
  currentLevel: "basic",
  timestamp: new Date().toISOString(),
  progressByTech: {
    javascript: {
      basic: {
        currentQuestion: 1,
        userAnswers: { 0: 0 },
        completedQuestions: [0],
        showResults: false,
        isSubmitted: false,
        reviewMode: false,
        timeLeft: 480,
        timerStartedAt: Date.now() - 120000,
        elapsedTime: 120,
        isQuizStarted: true,
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

console.log("\n=== Tech Quiz Master - Phase 2 Step 1 flow harness ===\n");

await check("1. first-time user sees Start Quiz", async () => {
  await mount();
  assert(
    pageText().includes("Select a technology"),
    "app should boot on the Home screen",
  );
  await selectLevel("JavaScript", "Basic");
  assert(buttonByText("Start Quiz", main()), "Start Quiz button missing");
  assert(!buttonByText("Resume Quiz", main()), "Resume Quiz should not show");
  assert(
    !buttonByText("Start New Quiz", main()),
    "Start New Quiz should not show",
  );
  assert(pageText().includes("Ready to Start?"), "start screen missing");
  await unmount();
});

await check("2. starting a quiz creates a fresh session", async () => {
  await mount();
  await selectLevel("JavaScript", "Basic");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  assert(pageText().includes("Question 1 of 5"), "quiz view not shown");

  const record = recordFor(readStorage(), "javascript", "basic");
  assert(record, "no persisted record");
  assertEqual(record.userAnswers, {}, "fresh attempt should have no answers");
  assertEqual(record.currentQuestion, 0, "fresh attempt starts at question 1");
  assertEqual(record.isQuizStarted, true, "isQuizStarted should be persisted");
  assertEqual(record.completedQuestions, [], "no completed questions yet");
  assertEqual(liveOneSecondIntervals.size, 1, "exactly one timer interval");
  await unmount();
});

await check("3. answering questions persists progress", async () => {
  await mount();
  await selectLevel("JavaScript", "Basic");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  await click(buttonByText("Alpha", main()), "first option");

  const record = recordFor(readStorage(), "javascript", "basic");
  assertEqual(record.userAnswers, { 0: 0 }, "answer not persisted");
  assertEqual(record.completedQuestions, [0], "completed set not persisted");

  await click(buttonContaining("Next Question", main()), "Next Question");
  await click(buttonByText("Bravo", main()), "second option on Q2");
  const after = recordFor(readStorage(), "javascript", "basic");
  assertEqual(after.userAnswers, { 0: 0, 1: 1 }, "second answer not persisted");
  await unmount();
});

await check("4. clicking Home preserves unfinished progress", async () => {
  await mount();
  await selectLevel("JavaScript", "Basic");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  await click(buttonByText("Alpha", main()), "first option");
  await click(buttonContaining("Next Question", main()), "Next Question");
  await clickHome();

  const storage = readStorage();
  const record = recordFor(storage, "javascript", "basic");
  assert(record, "Home wiped the saved record");
  assertEqual(record.userAnswers, { 0: 0 }, "Home lost the saved answers");
  assertEqual(record.currentQuestion, 1, "Home lost the current question");
  assertEqual(record.isQuizStarted, true, "unfinished attempt must stay marked");
  assertEqual(storage.currentTech, null, "active session should be cleared");
  assertEqual(storage.currentLevel, null, "active session should be cleared");
  assert(
    !pageText().includes("Question 1 of 5"),
    "visible session should be cleared",
  );
  assertEqual(liveOneSecondIntervals.size, 0, "timer must be stopped at Home");
  await unmount();
});

await check(
  "5. reselecting the same tech/level offers Resume and Start New",
  async () => {
    await mount();
    await selectLevel("JavaScript", "Basic");
    await click(buttonByText("Start Quiz", main()), "Start Quiz");
    await click(buttonByText("Alpha", main()), "first option");
    await clickHome();
    await clickTech("JavaScript");
    await clickLevel("Basic");

    assert(
      buttonByText("Resume Quiz", main()),
      "Resume Quiz button missing after reselect",
    );
    assert(
      buttonByText("Start New Quiz", main()),
      "Start New Quiz button missing after reselect",
    );
    assert(
      !buttonByText("Start Quiz", main()),
      "plain Start Quiz must not be offered while an attempt is unfinished",
    );
    assert(
      !pageText().includes("Question 1 of 5"),
      "reselecting a level must not drop the user back into the quiz",
    );
    assertEqual(liveOneSecondIntervals.size, 0, "no timer on the start screen");
    await unmount();
  },
);

await check("6. resume restores answers and the current question", async () => {
  await mount({ storage: seededAttempt() });
  assert(pageText().includes("Question 2 of 5"), "refresh did not restore");

  await clickHome();
  await clickTech("JavaScript");
  await clickLevel("Basic");
  await click(buttonByText("Resume Quiz", main()), "Resume Quiz");

  assert(
    pageText().includes("Question 2 of 5"),
    "resume did not restore the saved question",
  );

  // Checked before navigating so the assertion covers what resume itself
  // persisted (navigation afterwards rewrites the stored position, see below).
  assertEqual(
    recordFor(readStorage(), "javascript", "basic").currentQuestion,
    1,
    "resume must persist the restored question",
  );

  await click(buttonContaining("Previous Question", main()), "Previous Question");
  const selected = buttonByText("Alpha", main());
  assert(selected, "restored option missing");
  assert(
    selected.className.includes("border-brand-300"),
    "restored answer is not shown as selected",
  );

  const record = recordFor(readStorage(), "javascript", "basic");
  assertEqual(record.userAnswers, { 0: 0 }, "resume lost the saved answers");
  assertEqual(record.currentQuestion, 0, "storage must follow navigation");
  assertEqual(record.isQuizStarted, true, "resume must mark the quiz started");
  await unmount();
});

await check(
  "7. resume restores remaining time with a single interval",
  async () => {
    await mount({
      storage: seededAttempt({
        currentQuestion: 2,
        userAnswers: { 0: 0, 1: 1, 2: 2 },
        completedQuestions: [0, 1, 2],
      }),
    });
    assertEqual(liveOneSecondIntervals.size, 1, "refresh must own one interval");

    await clickHome();
    await clickTech("JavaScript");
    await clickLevel("Basic");
    await click(buttonByText("Resume Quiz", main()), "Resume Quiz");

    assertEqual(
      liveOneSecondIntervals.size,
      1,
      "resume must not create a second interval",
    );

    const record = recordFor(readStorage(), "javascript", "basic");
    assert(
      record.timeLeft >= 470 && record.timeLeft <= 480,
      `resume must keep the remaining time, got ${record.timeLeft}`,
    );
    assert(
      record.elapsedTime >= 120,
      `resume must keep elapsed time, got ${record.elapsedTime}`,
    );

    const timerText = (pageText().match(/\d{2}:\d{2}/) || [null])[0];
    assert(timerText, "timer display missing");
    const [mm, ss] = timerText.split(":").map(Number);
    const shown = mm * 60 + ss;
    assert(
      Math.abs(shown - record.timeLeft) <= 2,
      `timer display ${timerText} disagrees with saved ${record.timeLeft}s`,
    );

    await clickLevel("Intermediate");
    assertEqual(
      liveOneSecondIntervals.size,
      0,
      "leaving an active level must stop the timer",
    );
    await unmount();
  },
);

await check("8. cancelling Start New Quiz preserves saved progress", async () => {
  await mount();
  await selectLevel("JavaScript", "Basic");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  await click(buttonByText("Alpha", main()), "first option");
  await clickHome();
  await clickTech("JavaScript");
  await clickLevel("Basic");

  const before = readStorage();
  await click(buttonByText("Start New Quiz", main()), "Start New Quiz trigger");

  const modal = dialog();
  assert(modal, "confirmation dialog did not open");
  assert(
    modal.textContent.includes("unfinished attempt"),
    "dialog does not explain what will be replaced",
  );

  await click(buttonByText("Cancel", modal), "Cancel");

  assert(!dialog(), "dialog did not close");
  assertEqual(readStorage(), before, "cancel changed the saved progress");
  assert(
    buttonByText("Resume Quiz", main()),
    "Resume must still be offered after cancelling",
  );
  await unmount();
});

await check("9. confirming Start New Quiz creates a clean attempt", async () => {
  await mount();
  await selectLevel("JavaScript", "Basic");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  await click(buttonByText("Alpha", main()), "first option");
  await clickHome();
  await clickTech("JavaScript");
  await clickLevel("Basic");

  await click(buttonByText("Start New Quiz", main()), "Start New Quiz trigger");
  const modal = dialog();
  assert(modal, "confirmation dialog did not open");
  await click(buttonByText("Start New Quiz", modal), "confirm Start New Quiz");

  assert(!dialog(), "dialog should close on confirm");
  assert(pageText().includes("Question 1 of 5"), "fresh quiz view missing");

  const record = recordFor(readStorage(), "javascript", "basic");
  assertEqual(record.userAnswers, {}, "new attempt must start with no answers");
  assertEqual(record.currentQuestion, 0, "new attempt starts at question 1");
  assertEqual(record.isQuizStarted, true, "new attempt must be started");
  assert(
    record.timeLeft >= 595,
    `new attempt should get a full timer, got ${record.timeLeft}`,
  );
  assertEqual(record.summary, null, "new attempt must not keep an old score");
  assertEqual(liveOneSecondIntervals.size, 1, "exactly one timer interval");
  await unmount();
});

await check(
  "10. completed quizzes keep their results/review behaviour",
  async () => {
    await mount();
    await selectLevel("JavaScript", "Basic");
    await click(buttonByText("Start Quiz", main()), "Start Quiz");
    await click(buttonByText("Alpha", main()), "first option");
    await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");

    const modal = dialog();
    assert(modal, "submit confirmation missing");
    await click(buttonByText("Submit Quiz", modal), "confirm submit");
    await flush();

    assert(pageText().includes("Quiz Completed!"), "results screen missing");
    assert(
      buttonByText("Review Questions", main()),
      "review entry point missing",
    );

    const completed = readStorage();
    assertEqual(
      recordFor(completed, "javascript", "basic").isSubmitted,
      true,
      "submission must be persisted",
    );

    await clickHome();
    await clickTech("JavaScript");
    await clickLevel("Basic");

    assert(
      pageText().includes("Quiz Completed!"),
      "completed attempt must come back as results, not a start screen",
    );
    assert(
      !buttonByText("Resume Quiz", main()),
      "a completed attempt must not be offered as resumable",
    );
    assert(
      !buttonByText("Start Quiz", main()),
      "a completed attempt must not be offered as a plain start",
    );
    await unmount();
  },
);

await check("11. switching technologies does not mix saved progress", async () => {
  await mount();
  await selectLevel("JavaScript", "Basic");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  await click(buttonByText("Alpha", main()), "first option");
  await clickHome();

  await clickTech("HTML");
  await clickLevel("Basic");
  assert(
    buttonByText("Start Quiz", main()),
    "HTML/basic has no attempt and must offer Start Quiz",
  );
  await click(buttonByText("Start Quiz", main()), "Start Quiz (HTML)");
  await click(buttonByText("Bravo", main()), "HTML first option");

  const storage = readStorage();
  assertEqual(
    recordFor(storage, "javascript", "basic").userAnswers,
    { 0: 0 },
    "JavaScript answers must survive the HTML attempt",
  );
  assertEqual(
    recordFor(storage, "html", "basic").userAnswers,
    { 0: 1 },
    "HTML answers were not stored separately",
  );

  await clickHome();
  await clickTech("JavaScript");
  await clickLevel("Basic");
  assert(
    buttonByText("Resume Quiz", main()),
    "JavaScript attempt must still be resumable",
  );
  assertEqual(
    recordFor(readStorage(), "javascript", "basic").userAnswers,
    { 0: 0 },
    "JavaScript answers were mixed with the HTML attempt",
  );
  await unmount();
});

await check("12. corrupted localStorage is handled safely", async () => {
  await mount({ storage: "{ this is not json ]" });
  assert(
    pageText().includes("Select a technology"),
    "app did not boot from malformed JSON",
  );
  await unmount();

  // Structurally invalid (but parsable) record with an out-of-range index.
  await mount({
    storage: {
      currentTech: "javascript",
      currentLevel: "basic",
      timestamp: new Date().toISOString(),
      progressByTech: {
        javascript: {
          basic: {
            currentQuestion: 999,
            userAnswers: "not-an-object",
            completedQuestions: "not-an-array",
            isQuizStarted: true,
            isSubmitted: "yes",
            timeLeft: -50,
            elapsedTime: "nonsense",
            timerStartedAt: "whenever",
          },
        },
      },
    },
  });
  assert(pageText().length > 0, "nothing rendered for a corrupt record");
  assert(
    !pageText().includes("undefined"),
    "corrupt record leaked `undefined` into the UI",
  );
  await unmount();
});

await check("13. manual submission sends exactly one valid request", async () => {
  const handler = async (endpoint, method, body) => {
    if (endpoint === "/admin/quizzes") return CATALOG;
    if (endpoint === "/results/create") {
      assertEqual(method, "POST", "submission must be a POST");
      assert(body.quizId, "payload is missing quizId");
      assert(Array.isArray(body.answers), "payload answers must be an array");
      assert(
        body.answers.every(
          (a) => typeof a.questionId === "string" && "selectedAnswer" in a,
        ),
        "payload answers are malformed",
      );
      assert(
        typeof body.timeTaken === "number",
        "payload timeTaken must be a number",
      );
      assert(
        !("score" in body) && !("correctAnswers" in body),
        "client must not send a score",
      );
      return buildSubmissionResponse(body);
    }
    throw new Error(`unexpected endpoint ${endpoint}`);
  };

  await mount({ handler });
  await selectLevel("JavaScript", "Basic");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  await click(buttonByText("Alpha", main()), "first option");
  await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");

  const modal = dialog();
  assert(modal, "submit confirmation missing");
  const confirm = buttonByText("Submit Quiz", modal);
  assert(confirm, "submit confirm button missing");
  // Two rapid activations while the first request is still in flight.
  confirm.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  confirm.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  await flush();
  await flush();

  const posts = getApiCalls().filter((c) => c.endpoint === "/results/create");
  assertEqual(posts.length, 1, "manual submission must send exactly one POST");
  assert(pageText().includes("Quiz Completed!"), "results screen missing");
  await unmount();
});

await check("14. time-up submission sends exactly one valid request", async () => {
  const handler = async (endpoint, method, body) => {
    if (endpoint === "/admin/quizzes") return CATALOG;
    if (endpoint === "/results/create") return buildSubmissionResponse(body);
    throw new Error(`unexpected endpoint ${endpoint}`);
  };

  await mount({
    handler,
    storage: seededAttempt({
      currentQuestion: 4,
      userAnswers: { 0: 0, 1: 1 },
      completedQuestions: [0, 1],
      timeLeft: 0,
      elapsedTime: 600,
    }),
  });
  await flush();
  await flush();

  const posts = getApiCalls().filter((c) => c.endpoint === "/results/create");
  assertEqual(posts.length, 1, "auto submit must send exactly one POST");
  assert(pageText().includes("Quiz Completed!"), "results screen missing");

  const record = recordFor(readStorage(), "javascript", "basic");
  assertEqual(record.isSubmitted, true, "auto submit must persist");
  assertEqual(
    record.userAnswers,
    { 0: 0, 1: 1, 2: -1, 3: -1, 4: -1 },
    "auto submit must mark unanswered questions",
  );
  await unmount();
});

await check("15. refresh preserves resumable progress", async () => {
  const seeded = seededAttempt({
    currentQuestion: 3,
    userAnswers: { 0: 0, 1: 1, 2: 2 },
    completedQuestions: [0, 1, 2],
    timeLeft: 500,
    elapsedTime: 100,
  });

  await mount({ storage: seeded });
  assert(pageText().includes("Question 4 of 5"), "refresh lost the position");
  assertEqual(liveOneSecondIntervals.size, 1, "refresh must own one interval");

  // Unmount + remount == a page refresh.
  await unmount();
  await mount({ storage: seeded });
  assert(pageText().includes("Question 4 of 5"), "second refresh lost progress");

  await clickHome();
  await clickTech("JavaScript");
  await clickLevel("Basic");
  assert(
    buttonByText("Resume Quiz", main()),
    "refreshed attempt must still be resumable",
  );
  await click(buttonByText("Resume Quiz", main()), "Resume Quiz");
  assert(pageText().includes("Question 4 of 5"), "resume lost the position");
  assertEqual(
    recordFor(readStorage(), "javascript", "basic").userAnswers,
    { 0: 0, 1: 1, 2: 2 },
    "resume lost the answers",
  );
  await unmount();
});

await check("signed-out users are sent to the login gate", async () => {
  await mount({ signedIn: false });
  await selectLevel("JavaScript", "Basic");
  await click(buttonByText("Start Quiz", main()), "Start Quiz (signed out)");
  const modal = dialog();
  assert(modal, "login gate missing");
  assert(
    getOpenSignInCalls() === 0,
    "dialog should be shown before Clerk is opened",
  );
  assert(pageText().includes("Login Required"), "login dialog text missing");
  await unmount();
});

// ===========================================================================
// Phase 2 / Step 3 reliability checks
// ===========================================================================

const navigatorButtons = (scope = main()) =>
  $$("button", scope).filter((b) =>
    (b.getAttribute("aria-label") || "").startsWith("Go to question "),
  );

const questionNumberFromLabel = (label) =>
  Number((String(label).match(/^Go to question (\d+)/) || [])[1]);

// In review mode the option button also contains its feedback badge, so its
// textContent is no longer just the option label; aria-label stays exact.
const optionByLabel = (label) =>
  $$("button", main()).find((b) => {
    const aria = b.getAttribute("aria-label") || "";
    return aria === label || aria.startsWith(`${label},`);
  });

const jumpToQuestion = async (number) => {
  const target = navigatorButtons().find(
    (b) => questionNumberFromLabel(b.getAttribute("aria-label")) === number,
  );
  return click(target, `question ${number}`);
};

const waitForText = async (needle, timeout = 6000) => {
  const deadline = Date.now() + timeout;
  while (!pageText().includes(needle) && Date.now() < deadline) {
    await tick(100);
  }
  return pageText().includes(needle);
};

const postsToCreate = () =>
  getApiCalls().filter((c) => c.endpoint === "/results/create");

await check(
  "16. the stored position follows navigation across a refresh",
  async () => {
    await mount();
    await selectLevel("JavaScript", "Basic");
    await click(buttonByText("Start Quiz", main()), "Start Quiz");
    await click(buttonByText("Alpha", main()), "answer on question 1");
    await click(buttonContaining("Next Question", main()), "Next Question");
    await click(buttonByText("Bravo", main()), "answer on question 2");

    // No Home click and no timer stop: this is the state a browser refresh
    // would find if only the answer writes reached localStorage.
    const record = recordFor(readStorage(), "javascript", "basic");
    assert(record, "no persisted record");
    assertEqual(
      record.currentQuestion,
      1,
      "stored position must follow navigation",
    );
    assertEqual(record.userAnswers, { 0: 0, 1: 1 }, "answers lost");

    const seeded = readStorage();
    await unmount();
    await mount({ storage: seeded });
    assert(
      pageText().includes("Question 2 of 5"),
      "refresh must land on the question the user was last on",
    );
    await unmount();
  },
);

await check(
  "17. an open submit dialog cannot record a second submission",
  async () => {
    const handler = async (endpoint, method, body) => {
      if (endpoint === "/admin/quizzes") return CATALOG;
      if (endpoint === "/results/create") return buildSubmissionResponse(body);
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    await mount({
      handler,
      storage: seededAttempt({
        currentQuestion: 1,
        userAnswers: { 0: 0 },
        completedQuestions: [0],
        elapsedTime: 599,
        timeLeft: 1,
      }),
    });

    await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");
    assert(dialog(), "submit confirmation should be open");

    // The single-second timer expires while the dialog is still open.
    assert(
      await waitForText("Quiz Completed!"),
      "auto submit should finish while the dialog is open",
    );

    const openDialog = dialog();
    if (openDialog) {
      const confirm = buttonByText("Submit Quiz", openDialog);
      if (confirm) await click(confirm, "submit confirm after auto submit");
    }

    assertEqual(
      postsToCreate().length,
      1,
      "the same attempt must never be recorded twice",
    );
    assert(
      !dialog(),
      "the stale submit dialog must not stay open over the results",
    );
    await unmount();
  },
);

await check(
  "18. review shows the server correct answer and the user's answer",
  async () => {
    await mount();
    await selectLevel("JavaScript", "Basic");
    await click(buttonByText("Start Quiz", main()), "Start Quiz");
    // Fixture rule: option 0 is always the correct one.
    await click(buttonByText("Alpha", main()), "correct answer on question 1");
    await click(buttonContaining("Next Question", main()), "Next Question");
    await click(buttonByText("Bravo", main()), "wrong answer on question 2");
    await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");
    const modal = dialog();
    assert(modal, "submit confirmation missing");
    await click(buttonByText("Submit Quiz", modal), "confirm submit");

    await click(
      buttonByText("Review Questions", main()),
      "Review Questions",
    );
    assert(pageText().includes("Review Mode"), "review mode not shown");
    assertEqual(
      optionByLabel("Alpha").getAttribute("aria-label"),
      "Alpha, correct answer",
      "question 1 must mark the server's correct answer",
    );

    await click(buttonContaining("Next Question", main()), "Next Question");
    assertEqual(
      optionByLabel("Bravo").getAttribute("aria-label"),
      "Bravo, your answer",
      "question 2 must keep the user's answer",
    );
    assertEqual(
      optionByLabel("Alpha").getAttribute("aria-label"),
      "Alpha, correct answer",
      "question 2 must show the server's correct answer",
    );
    assert(
      pageText().includes(
        "Your answer was incorrect. The correct answer is option 1.",
      ),
      "review explanation is missing the correct option",
    );

    // The review must survive a refresh (server snapshot is persisted).
    const seeded = readStorage();
    await unmount();
    await mount({ storage: seeded });
    await clickHome();
    await clickTech("JavaScript");
    await clickLevel("Basic");
    assert(
      buttonByText("Review Questions", main()),
      "review must still be offered after a refresh",
    );
    await click(buttonByText("Review Questions", main()), "Review Questions");
    assert(pageText().includes("Review Mode"), "restored review not shown");
    await unmount();
  },
);

await check(
  "19. previous/next navigation stays inside the loaded quiz",
  async () => {
    await mount();
    await selectLevel("JavaScript", "Basic");
    await click(buttonByText("Start Quiz", main()), "Start Quiz");

    const previous = buttonByText("Previous Question", main());
    assert(previous, "Previous Question missing");
    assert(previous.disabled, "Previous must be disabled on the first question");
    assert(
      buttonByText("Next Question", main()),
      "Next Question must be available on the first question",
    );

    await jumpToQuestion(5);
    assert(pageText().includes("Question 5 of 5"), "jump to last question failed");
    assert(
      !buttonByText("Next Question", main()),
      "Next must not be offered on the last question",
    );

    await click(buttonContaining("Previous Question", main()), "Previous");
    assert(
      pageText().includes("Question 4 of 5"),
      "Previous must step back exactly one question",
    );
    await unmount();
  },
);

await check("20. a failed submission can be retried", async () => {
  let shouldFail = true;
  const handler = async (endpoint, method, body) => {
    if (endpoint === "/admin/quizzes") return CATALOG;
    if (endpoint === "/results/create") {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("network down");
      }
      return buildSubmissionResponse(body);
    }
    throw new Error(`unexpected endpoint ${endpoint}`);
  };

  await mount({ handler });
  await selectLevel("JavaScript", "Basic");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  await click(buttonByText("Alpha", main()), "first option");
  await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");
  const modal = dialog();
  assert(modal, "submit confirmation missing");
  await click(buttonByText("Submit Quiz", modal), "failing confirm");
  await flush();

  assertEqual(globalThis.__alerts.length, 1, "the failure should be reported");
  assert(
    !pageText().includes("Quiz Completed!"),
    "a failed submission must not show results",
  );
  const retryModal = dialog();
  assert(retryModal, "the dialog must stay open so the user can retry");
  await click(buttonByText("Submit Quiz", retryModal), "retry submit");
  await flush();

  assert(pageText().includes("Quiz Completed!"), "retry should succeed");
  assertEqual(
    postsToCreate().length,
    2,
    "one failed attempt plus one retry",
  );
  await unmount();
});

await check(
  "21. resuming an attempt whose time is up submits it exactly once",
  async () => {
    const handler = async (endpoint, method, body) => {
      if (endpoint === "/admin/quizzes") return CATALOG;
      if (endpoint === "/results/create") return buildSubmissionResponse(body);
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    await mount({
      handler,
      storage: seededAttempt({
        isQuizStarted: false,
        currentQuestion: 3,
        userAnswers: { 0: 0, 1: 1, 2: 2 },
        completedQuestions: [0, 1, 2],
        elapsedTime: 600,
        timeLeft: 0,
        timerStartedAt: null,
      }),
    });

    assert(
      buttonByText("Resume Quiz", main()),
      "an answered attempt must still be resumable",
    );
    await click(buttonByText("Resume Quiz", main()), "Resume Quiz");
    assert(
      await waitForText("Quiz Completed!"),
      "an expired attempt must submit on resume",
    );
    assertEqual(postsToCreate().length, 1, "expiry must submit exactly once");

    const record = recordFor(readStorage(), "javascript", "basic");
    assertEqual(record.isSubmitted, true, "expiry must persist the submission");
    assertEqual(
      record.userAnswers,
      { 0: 0, 1: 1, 2: 2, 3: -1, 4: -1 },
      "expiry must mark the unanswered questions",
    );
    assertEqual(
      liveOneSecondIntervals.size,
      0,
      "no timer may keep running after expiry",
    );
    await unmount();
  },
);

await check(
  "22. a partially answered quiz reports consistent counts",
  async () => {
    const handler = async (endpoint, method, body) => {
      if (endpoint === "/admin/quizzes") return CATALOG;
      if (endpoint === "/results/create") {
        assert(
          !("score" in body) && !("correctAnswers" in body),
          "client must not send a score",
        );
        return buildSubmissionResponse(body);
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    await mount({ handler });
    await selectLevel("JavaScript", "Basic");
    await click(buttonByText("Start Quiz", main()), "Start Quiz");
    await click(buttonByText("Alpha", main()), "correct answer");
    await click(buttonContaining("Next Question", main()), "Next Question");
    await click(buttonByText("Bravo", main()), "wrong answer");
    await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");
    const modal = dialog();
    assert(modal, "submit confirmation missing");
    await click(buttonByText("Submit Quiz", modal), "confirm submit");
    await flush();

    assert(pageText().includes("Quiz Completed!"), "results screen missing");
    const record = recordFor(readStorage(), "javascript", "basic");
    assertEqual(
      record.summary,
      { correct: 1, incorrect: 1, unattempted: 3, total: 5, percentage: 20 },
      "counts must come back consistent from the server",
    );
    assertEqual(
      record.userAnswers,
      { 0: 0, 1: 1, 2: -1, 3: -1, 4: -1 },
      "unanswered questions must be recorded as unattempted",
    );
    await unmount();
  },
);

await check(
  "23. a failed quiz catalog load shows an error with a retry",
  async () => {
    let attempt = 0;
    const handler = async (endpoint) => {
      if (endpoint === "/admin/quizzes") {
        attempt += 1;
        if (attempt === 1) throw new Error("catalog down");
        return CATALOG;
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    await mount({ handler });
    assert(
      pageText().includes("Couldn't load quizzes"),
      "catalog failure must surface an error state",
    );

    await click(buttonByText("Try again", main()), "retry catalog load");
    await flush();
    assert(
      !pageText().includes("Couldn't load quizzes"),
      "retry must clear the error state",
    );
    await selectLevel("JavaScript", "Basic");
    assert(buttonByText("Start Quiz", main()), "catalog retry must work");
    await unmount();
  },
);

// ---------------------------------------------------------------------------
// attempt identity (server-side submission idempotency, Phase 2 Step 4)
// ---------------------------------------------------------------------------
await check(
  "24. the submission carries the attempt identity minted at Start",
  async () => {
    await mount();
    await selectLevel("JavaScript", "Basic");
    await click(buttonByText("Start Quiz", main()), "Start Quiz");

    const started = recordFor(readStorage(), "javascript", "basic");
    assert(isUuid(started?.attemptId), "Start Quiz must mint an attempt id");

    await click(buttonByText("Alpha", main()), "first option");
    await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");
    const modal = dialog();
    assert(modal, "submit confirmation missing");
    await click(buttonByText("Submit Quiz", modal), "confirm submit");

    const posts = postsToCreate();
    assertEqual(posts.length, 1, "expected exactly one submission");
    assertEqual(
      posts[0].body.attemptId,
      started.attemptId,
      "the submission must reuse the id persisted with the attempt",
    );
    await unmount();
  },
);

await check("25. a retried submission reuses the same attempt identity", async () => {
  let shouldFail = true;
  const handler = async (endpoint, method, body) => {
    if (endpoint === "/admin/quizzes") return CATALOG;
    if (endpoint === "/results/create") {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("network down");
      }
      return buildSubmissionResponse(body);
    }
    throw new Error(`unexpected endpoint ${endpoint}`);
  };

  await mount({ handler });
  await selectLevel("JavaScript", "Basic");
  await click(buttonByText("Start Quiz", main()), "Start Quiz");
  await click(buttonByText("Alpha", main()), "first option");
  await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");
  await click(buttonByText("Submit Quiz", dialog()), "failing confirm");
  await flush();

  const retryModal = dialog();
  assert(retryModal, "the dialog must stay open so the user can retry");
  await click(buttonByText("Submit Quiz", retryModal), "retry submit");
  await flush();

  const posts = postsToCreate();
  assertEqual(posts.length, 2, "one failed attempt plus one retry");
  assert(
    isUuid(posts[0].body.attemptId),
    "the first attempt must already carry an idempotency key",
  );
  assertEqual(
    posts[1].body.attemptId,
    posts[0].body.attemptId,
    "a retry must re-send the same attempt id",
  );
  await unmount();
});

await check("26. Resume Quiz reuses the saved attempt identity", async () => {
  const attemptId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  await mount({
    storage: seededAttempt({
      attemptId,
      isQuizStarted: false,
      currentQuestion: 2,
      userAnswers: { 0: 0, 1: 1 },
      completedQuestions: [0, 1],
    }),
  });

  await click(buttonByText("Resume Quiz", main()), "Resume Quiz");
  assert(pageText().includes("Question 3 of 5"), "resume must restore position");

  await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");
  const modal = dialog();
  assert(modal, "submit confirmation missing");
  await click(buttonByText("Submit Quiz", modal), "confirm submit");

  const posts = postsToCreate();
  assertEqual(posts.length, 1, "expected exactly one submission");
  assertEqual(
    posts[0].body.attemptId,
    attemptId,
    "resume must keep the identity of the attempt it resumed",
  );
  await unmount();
});

await check("27. Start New Quiz mints a fresh attempt identity", async () => {
  const previousAttemptId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  await mount({
    storage: seededAttempt({
      attemptId: previousAttemptId,
      currentQuestion: 2,
      userAnswers: { 0: 0, 1: 1 },
      completedQuestions: [0, 1],
    }),
  });

  await clickHome();
  await clickTech("JavaScript");
  await clickLevel("Basic");
  await click(buttonByText("Start New Quiz", main()), "Start New Quiz trigger");
  const modal = dialog();
  assert(modal, "confirmation dialog did not open");
  await click(buttonByText("Start New Quiz", modal), "confirm Start New Quiz");

  const record = recordFor(readStorage(), "javascript", "basic");
  assert(isUuid(record.attemptId), "Start New must mint an attempt id");
  assert(
    record.attemptId !== previousAttemptId,
    "a new attempt must never inherit the previous attempt's identity",
  );

  await click(buttonByText("Submit Quiz", main()), "Submit Quiz trigger");
  const confirmModal = dialog();
  assert(confirmModal, "submit confirmation missing");
  await click(buttonByText("Submit Quiz", confirmModal), "confirm submit");
  const posts = postsToCreate();
  assertEqual(posts.length, 1, "expected exactly one submission");
  assertEqual(
    posts[0].body.attemptId,
    record.attemptId,
    "the submission must carry the new attempt's identity",
  );
  await unmount();
});

await check(
  "28. a restored attempt without an id still submits with a key",
  async () => {
    // A record saved before attempt ids existed: the refresh restores it
    // straight into the quiz (no start/resume action), so the submission
    // pipeline mints the missing key and persists it before posting.
    await mount({
      storage: seededAttempt({
        currentQuestion: 4,
        userAnswers: { 0: 0, 1: 1 },
        completedQuestions: [0, 1],
        timeLeft: 0,
        elapsedTime: 600,
      }),
    });
    await flush();
    await flush();

    const posts = postsToCreate();
    assertEqual(posts.length, 1, "auto submit must send exactly one POST");
    assert(
      isUuid(posts[0].body.attemptId),
      "a legacy record must still submit with an idempotency key",
    );
    const record = recordFor(readStorage(), "javascript", "basic");
    assertEqual(
      record.attemptId,
      posts[0].body.attemptId,
      "the minted key must be persisted with the attempt",
    );
    await unmount();
  },
);

// ---------------------------------------------------------------------------
// teardown
// ---------------------------------------------------------------------------
await server.close();
clearIntervals();

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) {
  console.error(`Failed:\n  - ${failures.join("\n  - ")}`);
}
process.exit(failed > 0 ? 1 : 0);
