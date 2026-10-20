// Pure data handling for quiz results, kept out of the UI layer so it can be
// tested independently of React.

// Returns null when a result entry is missing the fields the UI needs,
// so a malformed payload can never crash the results list.
export const formatResult = (rawResult) => {
  if (!rawResult || typeof rawResult !== 'object') return null

  const { technology, level, totalQuestions, correctAnswers, selectedAnswers } = rawResult
  if (typeof technology !== 'string' || technology.trim() === '') return null
  if (typeof level !== 'string' || level.trim() === '') return null

  const total = Number(totalQuestions)
  const correct = Number(correctAnswers)
  if (!Number.isFinite(total) || !Number.isFinite(correct)) return null

  // Secure submissions store the per-question review, which is the only place
  // the attempted/unattempted split survives: the stored totals cannot tell a
  // wrong answer from a skipped one. Legacy (client-scored) records carry
  // totals only and keep the original fallback where everything that is not
  // correct counts as wrong and nothing is reported as unattempted.
  const reviewEntries = Array.isArray(selectedAnswers)
    ? selectedAnswers.filter((entry) => entry && typeof entry === 'object')
    : []
  const hasReview = reviewEntries.length > 0

  const unattempted = hasReview
    ? reviewEntries.filter((entry) => Number(entry.selectedAnswer) === -1)
        .length
    : 0
  const wrong = hasReview
    ? reviewEntries.filter(
        (entry) => Number(entry.selectedAnswer) !== -1 && entry.isCorrect !== true,
      ).length
    : total - correct

  return {
    ...rawResult,
    correct,
    wrong,
    unattempted: Math.max(unattempted, 0),
    title: `${technology.toUpperCase()} ${level.charAt(0).toUpperCase() + level.slice(1)}`,
  }
}

// Validates the /results/my-results payload before it reaches the component.
// Returns { results } on success or { error } with a safe user-facing message.
export const parseResultsPayload = (payload) => {
  const unexpectedResponseError =
    'The server returned an unexpected response. Please try again.'

  if (!Array.isArray(payload)) return { error: unexpectedResponseError }

  const results = payload.map(formatResult).filter(Boolean)
  if (payload.length > 0 && results.length === 0) {
    return { error: unexpectedResponseError }
  }

  return { results }
}

// The authorized historical-review contract: the per-question snapshot the
// secure submission path stores on the result itself (question text, options,
// the picked index, the correct index). It is the same data the live review
// screen shows, so reopening a past attempt never needs a new API call and
// never exposes the Quiz's stored answerKey.
//
// Returns the usable entries, or null when the record carries no review
// snapshot (legacy client-scored results) so the UI can explain instead of
// rendering an empty review.
export const extractReviewEntries = (result) => {
  const entries = Array.isArray(result?.selectedAnswers)
    ? result.selectedAnswers
    : []

  const usable = entries.filter(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      typeof entry.question === 'string' &&
      entry.question.trim() !== '' &&
      Array.isArray(entry.options) &&
      entry.options.length > 0 &&
      Number.isInteger(entry.selectedAnswer) &&
      entry.selectedAnswer >= -1 &&
      entry.selectedAnswer < entry.options.length &&
      Number.isInteger(entry.correctAnswer) &&
      entry.correctAnswer >= 0 &&
      entry.correctAnswer < entry.options.length,
  )

  return usable.length > 0 ? usable : null
}
