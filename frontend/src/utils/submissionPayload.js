// Builds the submission body for POST /results/create.
// The server re-grades against the stored answerKey, so the client only
// reports which option index was picked for each question (-1 = unanswered).
// `attemptId` is the idempotency key of the current attempt: the same value is
// sent on every retry of that attempt so the server can drop duplicates, and a
// new attempt always carries a new one. It is only added when present, so
// callers that predate the field keep the exact legacy payload.
export function buildSubmissionPayload({
  quizId,
  questions,
  answersByIndex,
  timeTaken,
  attemptId,
}) {
  if (!quizId) {
    throw new Error("Cannot submit: quiz id is missing.");
  }

  const answers = questions.map((question, index) => {
    if (!question || !question._id) {
      throw new Error("Cannot submit: quiz questions are missing ids.");
    }

    const selectedAnswer = answersByIndex[index];
    return {
      questionId: question._id,
      selectedAnswer:
        selectedAnswer === undefined || selectedAnswer === null
          ? -1
          : selectedAnswer,
    };
  });

  const payload = { quizId, answers, timeTaken };
  if (typeof attemptId === "string" && attemptId) {
    payload.attemptId = attemptId;
  }
  return payload;
}

// Maps the server summary onto the shape the results screen already renders
// (correct/incorrect/unattempted/total/percentage) so the screen keeps one
// stable shape regardless of where the summary came from.
export function summarizeSubmission(summary) {
  if (!summary) return null;

  return {
    correct: summary.correctAnswers ?? 0,
    incorrect: summary.wrongAnswers ?? 0,
    unattempted: summary.unattempted ?? 0,
    total: summary.totalQuestions ?? 0,
    percentage: summary.percentage ?? 0,
  };
}
