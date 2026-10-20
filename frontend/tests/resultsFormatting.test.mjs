// Phase 2 / Step 3: results formatting contract.
// Extended in Phase 2 / Step 5 with the attempt-history helpers: the
// performance summary (totals, average, best, trend) and the historical
// review-snapshot extractor.
//
// My Result derives its Correct / Wrong / Unattempted columns from the record
// returned by GET /results/my-results. Secure submissions carry the per-question
// review (`selectedAnswers`), which is the only place the server keeps the
// attempted-vs-unattempted split; legacy records only carry totals.
//
// Run:  node tests/resultsFormatting.test.mjs     (from the frontend directory)

import assert from "node:assert/strict";
import {
  formatResult,
  parseResultsPayload,
  extractReviewEntries,
} from "../src/utils/quizResults.js";
import {
  summarizePerformance,
  TREND_MINIMUM_ATTEMPTS,
} from "../src/utils/performanceSummary.js";

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  ${err && err.message}`);
  }
}

const reviewEntry = (selectedAnswer, correctAnswer, isCorrect) => ({
  questionId: "656f000000000000000000aa",
  question: "Q",
  options: ["A", "B", "C", "D"],
  selectedAnswer,
  correctAnswer,
  isCorrect,
});

const secureRecord = {
  technology: "javascript",
  level: "basic",
  totalQuestions: 5,
  correctAnswers: 2,
  score: 2,
  // 2 correct, 1 wrong, 2 unanswered
  selectedAnswers: [
    reviewEntry(0, 0, true),
    reviewEntry(1, 1, true),
    reviewEntry(2, 0, false),
    reviewEntry(-1, 1, false),
    reviewEntry(-1, 2, false),
  ],
};

await check(
  "secure records split wrong and unattempted from the stored review",
  () => {
    const formatted = formatResult(secureRecord);
    assert(formatted, "secure record was rejected");
    assert.equal(formatted.correct, 2);
    assert.equal(formatted.wrong, 1, "wrong must not swallow unattempted");
    assert.equal(formatted.unattempted, 2);
    assert.equal(
      formatted.correct + formatted.wrong + formatted.unattempted,
      formatted.totalQuestions,
      "counts must add up to the total",
    );
  },
);

await check("legacy records keep the previous totals-only fallback", () => {
  const formatted = formatResult({
    technology: "html",
    level: "advanced",
    totalQuestions: 10,
    correctAnswers: 7,
    score: 7,
  });
  assert(formatted, "legacy record was rejected");
  assert.equal(formatted.correct, 7);
  assert.equal(formatted.wrong, 3);
  assert.equal(formatted.unattempted, 0);
});

await check("the score percentage inputs are left untouched", () => {
  const formatted = formatResult(secureRecord);
  assert.equal(formatted.title, "JAVASCRIPT Basic");
  assert.equal(formatted.totalQuestions, 5);
  assert.equal(formatted.score, 2);
});

await check("an empty review array falls back to the totals", () => {
  const formatted = formatResult({ ...secureRecord, selectedAnswers: [] });
  assert(formatted, "record with an empty review was rejected");
  assert.equal(formatted.wrong, 3);
  assert.equal(formatted.unattempted, 0);
});

await check("malformed entries are dropped instead of crashing", () => {
  assert.equal(formatResult(null), null);
  assert.equal(formatResult("nope"), null);
  assert.equal(formatResult({ technology: "", level: "basic" }), null);
  assert.equal(
    formatResult({ technology: "java", level: "basic", totalQuestions: "x" }),
    null,
  );
});

await check("parseResultsPayload validates the payload shape", () => {
  assert.ok(parseResultsPayload([secureRecord]).results.length === 1);
  assert.ok(parseResultsPayload([]).results.length === 0);
  assert.ok(parseResultsPayload({ results: [] }).error);
  assert.ok(
    parseResultsPayload([null, undefined]).error,
    "an all-invalid payload must report an error",
  );
});

// ---------------------------------------------------------------------------
// Phase 2 / Step 5: performance summary rules
// ---------------------------------------------------------------------------
// The summary runs over the SAME parsed rows My Result renders (formatResult
// adds the numeric `correct` field the eligibility rule reads).
const scoredRow = (correct, total, isoDate) =>
  formatResult({
    technology: "javascript",
    level: "basic",
    totalQuestions: total,
    correctAnswers: correct,
    score: correct,
    createdAt: isoDate,
    startDate: isoDate,
  });

const day = (n) => `2025-06-${String(n).padStart(2, "0")}T10:00:00.000Z`;

await check("performance summary never fabricates numbers for empty or bad data", () => {
  assert.deepEqual(summarizePerformance([]), {
    attempts: 0,
    average: null,
    best: null,
    trend: null,
  });
  assert.deepEqual(summarizePerformance(undefined), {
    attempts: 0,
    average: null,
    best: null,
    trend: null,
  });

  const allIneligible = summarizePerformance([
    scoredRow(0, 0, day(1)), // no questions to score against
    scoredRow(11, 10, day(2)), // correct count beyond the total
    formatResult({
      technology: "java",
      level: "basic",
      totalQuestions: "x",
      correctAnswers: 1,
    }), // formatResult already rejected it -> null
    null, // raw garbage
    { technology: "java", level: "basic", totalQuestions: 10 }, // no correct field
  ]);
  assert.equal(allIneligible.attempts, 0, "corrupt rows must not count as attempts");
  assert.equal(allIneligible.average, null);
  assert.equal(allIneligible.best, null);
});

await check("average is the mean of attempt percentages, not pooled totals", () => {
  const summary = summarizePerformance([
    scoredRow(1, 2, day(1)), // 50%
    scoredRow(9, 10, day(2)), // 90%
  ]);
  assert.equal(summary.attempts, 2);
  assert.equal(summary.average, 70, "mean of 50 and 90 (pooled would be 83)");
  assert.equal(summary.best, 90);
  assert.equal(summary.trend, null, "no trend below the 6-attempt minimum");
  assert.equal(TREND_MINIMUM_ATTEMPTS, 6, "UI placeholder depends on this minimum");
});

await check("trend stays hidden until 6 scored attempts", () => {
  const five = [1, 2, 3, 4, 5].map((n) => scoredRow(n, 10, day(n)));
  assert.equal(summarizePerformance(five).trend, null);
  const six = [...five, scoredRow(10, 10, day(6))];
  assert(summarizePerformance(six).trend, "the 6th attempt unlocks the trend");
});

const trendFixture = (order = "desc") => {
  // Oldest three attempts: 1/10 (10%). Newest three: 9/10 (90%).
  const rows = [
    scoredRow(1, 10, day(1)),
    scoredRow(1, 10, day(2)),
    scoredRow(1, 10, day(3)),
    scoredRow(9, 10, day(4)),
    scoredRow(9, 10, day(5)),
    scoredRow(9, 10, day(6)),
  ];
  return order === "asc" ? rows : rows.reverse();
};

await check("trend compares the newest 3 attempts with the 3 before them", () => {
  const { trend } = summarizePerformance(trendFixture("desc"));
  assert(trend, "trend missing for a 6-attempt history");
  assert.equal(trend.recentAverage, 90);
  assert.equal(trend.previousAverage, 10);
  assert.equal(trend.delta, 80);
  assert.equal(trend.direction, "up");
});

await check("trend reports down and flat directions too", () => {
  // Genuine regression: older attempts strong (9/10), newer ones weak (1/10).
  const down = summarizePerformance([
    scoredRow(9, 10, day(1)),
    scoredRow(9, 10, day(2)),
    scoredRow(9, 10, day(3)),
    scoredRow(1, 10, day(4)),
    scoredRow(1, 10, day(5)),
    scoredRow(1, 10, day(6)),
  ]);
  assert.equal(down.trend.direction, "down");
  assert.equal(down.trend.delta, -80);

  const flat = summarizePerformance(
    [1, 2, 3, 4, 5, 6].map((n) => scoredRow(5, 10, day(n))),
  );
  assert.equal(flat.trend.direction, "flat");
  assert.equal(flat.trend.delta, 0);
});

await check("summary re-sorts by createdAt so an out-of-order payload still trends correctly", () => {
  // Oldest-first input: without the defensive sort the "newest" window would
  // actually be the oldest attempts and the direction would flip to down.
  const summary = summarizePerformance(trendFixture("asc"));
  assert.equal(summary.trend.direction, "up");
  assert.equal(summary.trend.delta, 80);

  // Rows without a usable createdAt sink below the dated ones instead of
  // crashing the sort.
  const undated = summarizePerformance([
    { ...scoredRow(9, 10, undefined), createdAt: undefined },
    scoredRow(1, 10, day(1)),
  ]);
  assert.equal(undated.attempts, 2);
  assert.equal(undated.average, 50);
});

// ---------------------------------------------------------------------------
// Phase 2 / Step 5: historical review extraction
// ---------------------------------------------------------------------------
await check("extractReviewEntries returns the authorized snapshot entries", () => {
  const entries = extractReviewEntries(secureRecord);
  assert(entries, "secure record lost its review snapshot");
  assert.equal(entries.length, secureRecord.selectedAnswers.length);
  assert.equal(typeof entries[0].correctAnswer, "number");
});

await check("extractReviewEntries returns null when there is no usable snapshot", () => {
  assert.equal(extractReviewEntries({ ...secureRecord, selectedAnswers: [] }), null);
  assert.equal(extractReviewEntries({ technology: "python", level: "basic" }), null);
  assert.equal(extractReviewEntries(undefined), null);
  assert.equal(extractReviewEntries(null), null);
  // Every entry garbled -> no review, never a partial/unsafe render.
  assert.equal(
    extractReviewEntries({ selectedAnswers: [null, 42, { options: "nope" }] }),
    null,
  );
});

await check("extractReviewEntries drops unusable entries but keeps valid ones", () => {
  const entries = extractReviewEntries({
    selectedAnswers: [
      null,
      secureRecord.selectedAnswers[0],
      { ...secureRecord.selectedAnswers[1], options: [] },
      { ...secureRecord.selectedAnswers[1], correctAnswer: 99 },
    ],
  });
  assert(entries, "the one valid entry should survive");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].question, "Q");
});

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) {
  console.error(`Failed:\n  - see assertions above`);
}
process.exit(failed > 0 ? 1 : 0);
