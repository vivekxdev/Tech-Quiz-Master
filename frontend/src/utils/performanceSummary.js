// Performance summary for the attempt history, computed from the SAME parsed
// rows My Result renders, so the headline numbers can never disagree with the
// list below them. Every rule is explicit — nothing here estimates or invents.
//
// Calculation rules:
// - Input order is newest-first (the API sorts createdAt DESC); rows are
//   re-sorted defensively by createdAt so an out-of-order payload still
//   produces correct "recent" windows. Rows without a usable createdAt keep
//   their relative order and sort last.
// - Attempt percentage = round(correct / totalQuestions * 100), the exact
//   formula the server summary uses, so history and review agree.
// - average: mean of the per-attempt percentages (each attempt weighted
//   equally, regardless of quiz length), rounded to a whole percent.
// - best: the highest per-attempt percentage.
// - trend: average of the 3 NEWEST eligible attempts minus the average of the
//   3 attempts before them. It needs at least 6 eligible attempts; below that
//   it is null and the UI says so instead of guessing a direction.
// - Eligibility: a row must have a positive numeric totalQuestions and a
//   correct count inside 0..totalQuestions. Ineligible/corrupt rows are
//   excluded from every figure (and from the attempt count, which therefore
//   counts SCORED attempts).

const TREND_WINDOW = 3;
const TREND_MIN_ATTEMPTS = TREND_WINDOW * 2;

const isValidTotal = (result) =>
  Number.isFinite(result.totalQuestions) && result.totalQuestions > 0;

const isEligible = (result) =>
  result !== null &&
  typeof result === "object" &&
  isValidTotal(result) &&
  Number.isFinite(result.correct) &&
  result.correct >= 0 &&
  result.correct <= result.totalQuestions;

const createdAtTime = (result) => {
  const time = Date.parse(result.createdAt);
  return Number.isFinite(time) ? time : null;
};

// Newest first; rows without a parseable createdAt sink below the dated ones.
const byNewestFirst = (a, b) => {
  const timeA = createdAtTime(a);
  const timeB = createdAtTime(b);
  if (timeA === null && timeB === null) return 0;
  if (timeA === null) return 1;
  if (timeB === null) return -1;
  return timeB - timeA;
};

const percentageOf = (result) =>
  Math.round((result.correct / result.totalQuestions) * 100);

const averageOf = (rows) =>
  Math.round(
    rows.reduce((sum, row) => sum + percentageOf(row), 0) / rows.length,
  );

export const summarizePerformance = (results) => {
  const eligible = (Array.isArray(results) ? results : [])
    .filter(isEligible)
    .slice()
    .sort(byNewestFirst);

  const attempts = eligible.length;
  if (attempts === 0) {
    return { attempts: 0, average: null, best: null, trend: null };
  }

  const percentages = eligible.map(percentageOf);
  const average = Math.round(
    percentages.reduce((sum, value) => sum + value, 0) / attempts,
  );
  const best = Math.max(...percentages);

  let trend = null;
  if (attempts >= TREND_MIN_ATTEMPTS) {
    const recentAverage = averageOf(eligible.slice(0, TREND_WINDOW));
    const previousAverage = averageOf(
      eligible.slice(TREND_WINDOW, TREND_WINDOW * 2),
    );
    const delta = recentAverage - previousAverage;
    trend = {
      recentAverage,
      previousAverage,
      delta,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    };
  }

  return { attempts, average, best, trend };
};

// Minimum attempts required before a trend direction can be shown; exported so
// the UI's "needs N attempts" placeholder stays in sync with the rule above.
export const TREND_MINIMUM_ATTEMPTS = TREND_MIN_ATTEMPTS;
