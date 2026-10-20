import assert from "node:assert/strict";
import {
  buildSubmissionPayload,
  summarizeSubmission,
} from "../src/utils/submissionPayload.js";

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

const questions = [
  { _id: "656f000000000000000000aa", answerKey: "A", correctAnswer: 0 },
  { _id: "656f000000000000000000bb", answerKey: "C", correctAnswer: 2 },
  { _id: "656f000000000000000000cc", answerKey: "B", correctAnswer: 1 },
];

await check("payload maps answer indices to questionIds in quiz order", () => {
  const payload = buildSubmissionPayload({
    quizId: "656f000000000000000000ff",
    questions,
    answersByIndex: { 0: 0, 1: 3, 2: -1 },
    timeTaken: 120,
  });

  assert.deepEqual(payload, {
    quizId: "656f000000000000000000ff",
    answers: [
      { questionId: "656f000000000000000000aa", selectedAnswer: 0 },
      { questionId: "656f000000000000000000bb", selectedAnswer: 3 },
      { questionId: "656f000000000000000000cc", selectedAnswer: -1 },
    ],
    timeTaken: 120,
  });
});

await check("unanswered, undefined and null entries become -1", () => {
  const sparse = buildSubmissionPayload({
    quizId: "656f000000000000000000ff",
    questions,
    answersByIndex: { 0: 1 },
    timeTaken: 5,
  });
  assert.deepEqual(
    sparse.answers.map((a) => a.selectedAnswer),
    [1, -1, -1],
  );

  const nullish = buildSubmissionPayload({
    quizId: "656f000000000000000000ff",
    questions,
    answersByIndex: { 0: null, 1: undefined, 2: -1 },
    timeTaken: 5,
  });
  assert.deepEqual(
    nullish.answers.map((a) => a.selectedAnswer),
    [-1, -1, -1],
  );
});

await check("missing quizId throws a clear error", () => {
  assert.throws(
    () =>
      buildSubmissionPayload({
        quizId: undefined,
        questions,
        answersByIndex: {},
        timeTaken: 1,
      }),
    /quiz id is missing/,
  );
});

await check("question without _id throws a clear error", () => {
  assert.throws(
    () =>
      buildSubmissionPayload({
        quizId: "656f000000000000000000ff",
        questions: [{ ...questions[0], _id: undefined }, ...questions.slice(1)],
        answersByIndex: {},
        timeTaken: 1,
      }),
    /missing ids/,
  );
});

await check("summary maps server keys to the results-screen shape", () => {
  assert.deepEqual(
    summarizeSubmission({
      totalQuestions: 3,
      correctAnswers: 2,
      wrongAnswers: 1,
      unattempted: 0,
      score: 2,
      percentage: 67,
    }),
    { correct: 2, incorrect: 1, unattempted: 0, total: 3, percentage: 67 },
  );
});

await check("missing summary returns null so display falls back locally", () => {
  assert.equal(summarizeSubmission(undefined), null);
  assert.equal(summarizeSubmission(null), null);
});

await check("summary shape matches calculateScore keys used by the screen", () => {
  const uiShape = summarizeSubmission({
    totalQuestions: 10,
    correctAnswers: 4,
    wrongAnswers: 3,
    unattempted: 3,
    score: 4,
    percentage: 40,
  });
  assert.deepEqual(
    Object.keys(uiShape).sort(),
    ["correct", "incorrect", "unattempted", "percentage", "total"].sort(),
  );
});

await check("attemptId is carried when the attempt has one", () => {
  const attemptId = "656f0000-0000-4000-8000-0000000000ff";
  const payload = buildSubmissionPayload({
    quizId: "656f000000000000000000ff",
    questions,
    answersByIndex: { 0: 0 },
    timeTaken: 10,
    attemptId,
  });
  assert.equal(payload.attemptId, attemptId);
  assert.deepEqual(
    payload.answers.map((a) => a.selectedAnswer),
    [0, -1, -1],
  );
});

await check("payload stays identical to the legacy shape without an attemptId", () => {
  // Callers that predate attempt ids (and any falsy/corrupt value) must keep
  // sending exactly the old body, so the server keeps treating them as
  // legacy, non-idempotent submissions.
  for (const attemptId of [undefined, null, "", 42]) {
    const payload = buildSubmissionPayload({
      quizId: "656f000000000000000000ff",
      questions,
      answersByIndex: { 0: 1 },
      timeTaken: 5,
      attemptId,
    });
    assert.deepEqual(payload, {
      quizId: "656f000000000000000000ff",
      answers: [
        { questionId: "656f000000000000000000aa", selectedAnswer: 1 },
        { questionId: "656f000000000000000000bb", selectedAnswer: -1 },
        { questionId: "656f000000000000000000cc", selectedAnswer: -1 },
      ],
      timeTaken: 5,
    });
  }
});

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);
