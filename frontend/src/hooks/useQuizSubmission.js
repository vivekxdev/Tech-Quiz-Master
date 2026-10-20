import { useRef, useState } from "react";
import {
  buildSubmissionPayload,
  summarizeSubmission,
} from "../utils/submissionPayload.js";
import { createAttemptId, getAttemptId } from "../utils/quizAttempt.js";

// Owns the quiz submission orchestration only:
//   - manual submit (confirm modal -> backend)
//   - timer auto-submit (onTimeUp -> same backend pipeline)
// The server stays the single source of truth for scoring/review; the client
// only ships { quizId, answers[{questionId, selectedAnswer}], timeTaken,
// attemptId }.
export function useQuizSubmission({
  selectedTech,
  selectedLevel,
  isSignedIn,
  openSignIn,
  userAnswers,
  currentQuestion,
  completedQuestions,
  isQuizStarted,
  isSubmitted,
  reviewMode,
  progressByTech,
  setUserAnswers,
  setReviewMode,
  setIsSubmitted,
  setIsQuizStarted,
  setShowResults,
  setServerSummary,
  setReviewSnapshot,
  setTimeLeft,
  setTimerStartedAt,
  setElapsedTime,
  stopTimer,
  calculateElapsedTime,
  getTimeLimit,
  persistProgressForLevel,
  request,
  getQuestions,
  getQuizId,
}) {
  // Confirmation modal for the manual submission flow
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Single-shot guard for the timer-triggered auto submit (re-armed on start)
  const hasAutoSubmittedRef = useRef(false);

  // One request at a time: a double click on the confirm button would
  // otherwise send two POSTs, and the timer expiring during a manual submit
  // would do the same. The ref guards the request itself; the mirrored
  // `isSubmitting` state drives the dialog's disabled/busy UI so the guard is
  // also visible to the user. Cleared in `finally` so a failed request stays
  // retryable.
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetAutoSubmitGuard = () => {
    hasAutoSubmittedRef.current = false;
  };

  // Idempotency key of the attempt being submitted. The manual confirm path
  // and the timer auto-submit path both read it from the SAME persisted
  // progress record, so they always converge on one identity, and a retry
  // after a failed or lost response re-sends the same value for the server to
  // collapse into the already-recorded result.
  const resolveAttemptId = () => {
    const savedAttemptId = getAttemptId(
      progressByTech?.[selectedTech]?.[selectedLevel],
    );
    if (savedAttemptId) return savedAttemptId;

    // A record saved before attempt ids existed (a refresh restores such an
    // attempt without running start/resume) still needs an identity: mint one
    // and persist it BEFORE the request goes out, so the retry after a lost
    // response reuses it.
    const attemptId = createAttemptId();
    persistProgressForLevel(selectedTech, selectedLevel, { attemptId });
    return attemptId;
  };

  // Shared pipeline for BOTH manual and auto submission: clears the previous
  // server result, posts the secure payload and stores the server summary +
  // review snapshot (server grades against the stored answerKey). Returns the
  // attemptId that was sent so the caller can persist it alongside the result
  // (a state update queued here may not have committed yet when the response
  // lands, so the value must travel with the response, not be re-read).
  const requestServerSubmission = async ({
    questions,
    newAnswers,
    timeTaken,
  }) => {
    setServerSummary(null);
    setReviewSnapshot(null);
    const attemptId = resolveAttemptId();
    const response = await request(
      "/results/create",
      "POST",
      buildSubmissionPayload({
        quizId: getQuizId(),
        questions,
        answersByIndex: newAnswers,
        timeTaken,
        attemptId,
      }),
    );
    const summary = summarizeSubmission(response?.summary);
    const reviewOfSubmission = response?.result?.selectedAnswers || null;
    setServerSummary(summary);
    setReviewSnapshot(reviewOfSubmission);
    return { summary, reviewOfSubmission, attemptId };
  };

  // Shared persistence payload written after a successful submission, so the
  // server review survives a refresh. attemptId is written explicitly: it is
  // the identity of the attempt that was just recorded, so a later retry of
  // this level can never fall back to a different (or missing) key.
  const persistSubmissionResult = ({
    newAnswers,
    finalElapsedTime,
    summary,
    reviewOfSubmission,
    attemptId,
  }) => {
    persistProgressForLevel(selectedTech, selectedLevel, {
      currentQuestion,
      userAnswers: newAnswers,
      showResults: true,
      completedQuestions: Array.from(completedQuestions),
      isSubmitted: true,
      reviewMode: false,
      timeLeft: 0,
      timerStartedAt: null,
      elapsedTime: finalElapsedTime,
      isQuizStarted: false,
      attemptId,
      summary,
      reviewSnapshot: reviewOfSubmission,
    });
  };

  // Manage Time Up: Auto-submit the quiz (server does the scoring), save result, and update UI state
  const handleTimeUp = async () => {
    // A manual submit is already in flight: skip without consuming the
    // single-shot guard, so a failed manual submit can still be auto-retried.
    if (isSubmittingRef.current) return;

    // 🛑 Step 1: Lock Redundancy - Ensure auto-submit ek hi baar trigger ho
    if (hasAutoSubmittedRef.current) return;
    hasAutoSubmittedRef.current = true;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    // Step 2: Stop UI Timer
    stopTimer();

    try {
      const questions = getQuestions();
      if (!questions || questions.length === 0) return;

      // 📝 Step 3: Preparation - Jo unanswered hain unhe -1 mark karo (Auto-submit behavior)
      let newAnswers = { ...userAnswers };
      questions.forEach((_, index) => {
        if (newAnswers[index] === undefined || newAnswers[index] === null) {
          newAnswers[index] = -1;
        }
      });

      setUserAnswers(newAnswers);

      // Time taken will be the full limit since time is up
      const finalElapsedTime = getTimeLimit(selectedTech, selectedLevel);

      // 🚀 Step 4: Backend Call - server grades against the stored answerKey
      // Note: Isme isSignedIn check isliye nahi hai kyunki quiz start hi tab hua tha jab user logged in tha
      const { summary, reviewOfSubmission, attemptId } =
        await requestServerSubmission({
          questions,
          newAnswers,
          timeTaken: finalElapsedTime,
        });

      // ✅ Step 5: Final UI State Update
      setIsSubmitted(true);
      setIsQuizStarted(false);
      setShowResults(true);
      // The attempt is already recorded: any confirm dialog left open by the
      // user must not offer a second submission over the results screen.
      setShowSubmitModal(false);
      setTimeLeft(0);
      setTimerStartedAt(null);
      setElapsedTime(finalElapsedTime);

      // 💾 Step 6: Persist State - the server review is saved together with
      // the quiz progress so a refresh can still render it
      persistSubmissionResult({
        newAnswers,
        finalElapsedTime,
        summary,
        reviewOfSubmission,
        attemptId,
      });
    } catch (err) {
      console.error("AUTO SUBMIT BACKEND ERROR:", err);
      // Even if API fails, we show results to user so they don't get stuck
      setShowResults(true);
      setIsSubmitted(true);
      setIsQuizStarted(false);
      setShowSubmitModal(false);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Submit button: already submitted -> just show results, otherwise ask first
  const handleSubmitQuiz = () => {
    if (!isQuizStarted && !reviewMode) return;

    // already submitted → just show results
    if (isSubmitted) {
      setShowResults(true);
      setReviewMode(false);
      return;
    }

    // open professional modal instead of window.confirm
    setShowSubmitModal(true);
  };

  const confirmSubmit = async () => {
    // 🛑 Step 1: Security Guard - Agar user login nahi hai toh hit nahi hone dena
    if (!isSignedIn) {
      setShowSubmitModal(false); // Modal band karo
      openSignIn(); // Clerk login popup dikhao
      return;
    }

    // The timer may have recorded this attempt while the dialog was still
    // open (a confirm click can land between the response and the re-render).
    // Closing instead of posting keeps a single attempt from being scored
    // and stored twice.
    if (isSubmitted) {
      setShowSubmitModal(false);
      setShowResults(true);
      return;
    }

    // Ignore a second confirm while the first request is still in flight
    // (the confirm button stays clickable until the response arrives).
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // 🛑 Step 2: Validation - Check karo questions load huye hain ya nahi
      const questions = getQuestions();
      if (!questions || questions.length === 0) {
        console.error("No questions found to submit.");
        return;
      }

      // 📝 Step 3: Answers Preparation - Jo attempt nahi huye unhe -1 mark karo
      let newAnswers = { ...userAnswers };
      questions.forEach((_, index) => {
        if (newAnswers[index] === undefined || newAnswers[index] === null) {
          newAnswers[index] = -1;
        }
      });

      // Step 4: Logic - Timer stop karo aur total time calculate karo
      stopTimer();
      const finalElapsedTime = calculateElapsedTime();

      // 🚀 Step 5: Backend Call - Axios useApi hook ke through; server grades against the stored answerKey
      const { summary, reviewOfSubmission, attemptId } =
        await requestServerSubmission({
          questions,
          newAnswers,
          timeTaken: finalElapsedTime,
        });

      // ✅ Step 6: UI Update - Quiz state ko results screen par le jao
      setUserAnswers(newAnswers); // Final marked answers set karo
      setShowResults(true);
      setIsSubmitted(true);
      setIsQuizStarted(false);
      setTimeLeft(0);
      setElapsedTime(finalElapsedTime);
      setShowSubmitModal(false); // Confirmation modal band karo

      // 💾 Step 7: Persistence - the server review is saved together with the
      // quiz progress so a refresh can still render the review
      persistSubmissionResult({
        newAnswers,
        finalElapsedTime,
        summary,
        reviewOfSubmission,
        attemptId,
      });
    } catch (err) {
      // Error handling - Axios error log dikhayega
      console.error("MANUAL SUBMIT ERROR:", err);
      alert(err.message || "Failed to submit quiz. Please try again.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return {
    showSubmitModal,
    setShowSubmitModal,
    handleSubmitQuiz,
    confirmSubmit,
    isSubmitting,
    handleTimeUp,
    resetAutoSubmitGuard,
  };
}
