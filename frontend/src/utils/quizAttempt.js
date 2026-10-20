import { countAnswered } from "./quizProgress.js";

// Pure helpers describing a saved tech+level attempt. They are the single
// source of truth for "what should the start screen offer" and for the math
// used to restore a paused timer, so the session hook, the timer hook and the
// Sidebar can never disagree about a saved record.

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// Classification of one saved record:
//   "none"      -> nothing saved yet            -> Start Quiz
//   "resumable" -> unfinished saved attempt     -> Resume Quiz / Start New Quiz
//   "completed" -> submitted or under review    -> results / review screens
// Malformed records always fall back to "none" instead of throwing.
export const getAttemptStatus = (progress) => {
  if (!progress || typeof progress !== "object") return "none";

  // A submitted attempt is never offered as resumable progress, even when the
  // results flag was lost while navigating into review mode.
  if (progress.isSubmitted || progress.showResults || progress.reviewMode) {
    return "completed";
  }

  if (progress.isQuizStarted) return "resumable";

  const answers = progress.userAnswers;
  if (answers && typeof answers === "object" && countAnswered(answers) > 0) {
    return "resumable";
  }

  // A started attempt that had already burned some wall-clock time still
  // counts, even if no answer was recorded yet.
  if (toNumber(progress.elapsedTime) > 0) return "resumable";

  return "none";
};

// Remaining seconds for a restored attempt. Wall-clock elapsed time is the
// authoritative measure (the 1s interval can be browser-throttled, so the
// countdown alone must not decide how much time is left); the persisted
// timeLeft is only a fallback while no time limit is known yet.
export const resolveRemainingTime = ({ timeLimit, elapsedTime, timeLeft }) => {
  const limit = Math.max(toNumber(timeLimit), 0);
  const elapsed = Math.max(toNumber(elapsedTime), 0);
  if (limit > 0) return Math.max(limit - elapsed, 0);
  return Math.max(toNumber(timeLeft), 0);
};

// A record only carries a restorable timer when it has an active segment,
// consumed time, or a stored countdown. Anything else is treated as a fresh
// attempt rather than as expired progress.
export const hasSavedTimerAttempt = (progress) => {
  if (!progress || typeof progress !== "object") return false;
  return (
    Boolean(progress.timerStartedAt) ||
    toNumber(progress.elapsedTime) > 0 ||
    toNumber(progress.timeLeft) > 0
  );
};

// Clamp a possibly corrupt or out-of-date question index into the loaded
// quiz so a bad stored value can never strand the UI.
export const clampQuestionIndex = (index, questionCount) => {
  const count = Math.max(Math.floor(toNumber(questionCount)), 0);
  const safeIndex = Math.max(Math.floor(toNumber(index)), 0);
  if (count === 0) return safeIndex;
  return Math.min(safeIndex, count - 1);
};

// Identity of ONE quiz attempt, minted when the attempt starts and persisted
// with its progress record. Every submission for that attempt (manual confirm,
// timer auto-submit, a retry after a lost response, a submission after a
// refresh) sends the same id, so the server can collapse duplicates; a new
// attempt always mints a fresh id. The UUID v4 layout is what the backend
// validates (backend/controllers/resultController.js).
export const createAttemptId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Non-secure contexts (plain http on a LAN) omit randomUUID: build the same
  // v4 layout from getRandomValues instead of failing.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

// Read the attempt id back out of a saved progress record. Anything that is
// not a non-empty string (legacy records predating attempt ids, corrupt
// storage) counts as "this attempt has no identity yet".
export const getAttemptId = (progress) =>
  typeof progress?.attemptId === "string" && progress.attemptId
    ? progress.attemptId
    : null;
