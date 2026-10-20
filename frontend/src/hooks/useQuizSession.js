import { useEffect, useRef, useState } from "react";
import { findFirstUnansweredIndex } from "../utils/quizProgress.js";
import { getInitialProgressForTechLevel } from "../utils/quizStorage.js";
import {
  clampQuestionIndex,
  createAttemptId,
  getAttemptId,
  resolveRemainingTime,
} from "../utils/quizAttempt.js";

// Owns the quiz session state and the lifecycle/navigation actions that drive
// it:
//   - selected tech / level
//   - started / submitted / review / results flags
//   - current question, user answers, answered-question tracking
//   - start, home, tech/level switch, restart, review, answer & navigation
//
// It deliberately does NOT own:
//   - timer state         -> useQuizTimer
//   - localStorage writes -> useQuizPersistence
//   - submission/scoring  -> useQuizSubmission (server is the scorer)
//
// useQuizPersistence is created after this hook because it needs the session
// state above, so the later hooks are reached only through `integrationsRef`,
// which Sidebar fills in a layout effect alongside its own cross-hook refs
// (onSaveTimerStateRef / onTimeUpRef). Layout effects run before any passive
// effect or event handler, so the integrations are always current when used,
// and this keeps every hook free of cross-hook imports.
export function useQuizSession({
  savedState,
  questionsData,
  isSignedIn,
  setShowLoginModal,
  integrationsRef,
}) {
  // Progress restored for the level that was selected when the app loaded.
  // Migration support lives in utils/quizStorage.js.
  const initialProgress = getInitialProgressForTechLevel(
    savedState,
    savedState?.currentTech,
    savedState?.currentLevel,
  );

  // Selected tech & level
  const [selectedTech, setSelectedTech] = useState(
    savedState?.currentTech || null,
  );
  const [selectedLevel, setSelectedLevel] = useState(
    savedState?.currentLevel || null,
  );

  // Quiz start state
  const [isQuizStarted, setIsQuizStarted] = useState(
    savedState?.progressByTech?.[savedState?.currentTech]?.[
      savedState?.currentLevel
    ]?.isQuizStarted || false,
  );

  // Question / answer session state (seeded from the restored level)
  const [currentQuestion, setCurrentQuestion] = useState(
    initialProgress.currentQuestion || 0,
  );
  const [userAnswers, setUserAnswers] = useState(
    initialProgress.userAnswers || {},
  );
  const [showResults, setShowResults] = useState(
    initialProgress.showResults || false,
  );
  const [completedQuestions, setCompletedQuestions] = useState(
    new Set(initialProgress.completedQuestions || []),
  );

  // IMPORTANT: keep submission & review state per-level and mirrored to local
  // state for quick checks
  const [isSubmitted, setIsSubmitted] = useState(
    initialProgress.isSubmitted || false,
  );
  const [reviewMode, setReviewMode] = useState(
    initialProgress.reviewMode || false,
  ); // to see correct answers after submission
  // Server-generated score and review of the last successful submit for the
  // restored level; persisted with quiz progress because correctness can no
  // longer be derived from fetched quiz data
  const [serverSummary, setServerSummary] = useState(
    initialProgress.summary || null,
  );
  const [reviewSnapshot, setReviewSnapshot] = useState(
    initialProgress.reviewSnapshot || null,
  );

  // Double-click protection shared by Start Quiz / Resume Quiz: a second
  // activation of the SAME action on the SAME level inside a short window is
  // ignored so the session, timer and persisted record are only ever
  // initialized once per activation. The key includes the level so a rapid
  // switch to a different tech/level (or a different action) is never blocked.
  const startActionAtRef = useRef({ key: null, at: 0 });
  const canRunStartAction = (action) => {
    const now = Date.now();
    const key = `${action}:${selectedTech}:${selectedLevel}`;
    const last = startActionAtRef.current;
    if (last.key === key && now - last.at < 600) return false;
    startActionAtRef.current = { key, at: now };
    return true;
  };

  // Leaving the level (Home or "Change Level") ends the guarded activation
  // window: the next visit to the start screen is a fresh decision, so a
  // confirmed "Start New Quiz" can never be swallowed by a guard that was
  // armed on a previous visit.
  useEffect(() => {
    if (!selectedLevel) startActionAtRef.current = { key: null, at: 0 };
  }, [selectedLevel]);

  // Saved progress may point at a question index that does not exist in the
  // loaded quiz (corrupt or outdated storage). Adjust it during render - the
  // guarded alternative to an effect - so the quiz view can never be stranded
  // on the loading screen by a bad stored value.
  const loadedQuestions =
    selectedTech && selectedLevel
      ? questionsData?.[selectedTech]?.[selectedLevel]?.questions
      : null;
  const maxQuestionIndex =
    Array.isArray(loadedQuestions) && loadedQuestions.length > 0
      ? loadedQuestions.length - 1
      : -1;
  if (maxQuestionIndex >= 0) {
    const idx = Math.floor(Number(currentQuestion));
    if (!Number.isFinite(idx) || idx < 0 || idx > maxQuestionIndex) {
      setCurrentQuestion(
        clampQuestionIndex(currentQuestion, maxQuestionIndex + 1),
      );
    }
  }

  // Quiz catalog helper bound to the current selection (default args), also
  // accepted by useQuizSubmission and usable for any other tech/level.
  const getQuestions = (tech = selectedTech, level = selectedLevel) => {
    if (!tech || !level) return [];
    return questionsData[tech]?.[level]?.questions || [];
  };

  // =========================================================================
  // Session lifecycle
  // =========================================================================

  const handleHomeClick = () => {
    // Reset all states to show the initial "Select Technology" screen
    setSelectedTech(null);
    setSelectedLevel(null);
    setCurrentQuestion(0);
    setUserAnswers({});
    setShowResults(false);
    setIsQuizStarted(false);
    setReviewMode(false);

    // Stop timer if it's running
    const { isTimerRunning, stopTimer } = integrationsRef.current;
    if (isTimerRunning) {
      stopTimer();
    }
  };

  // Start Quiz Function
  const handleStartQuiz = () => {
    //  Step 1: Check if user is logged in
    if (!isSignedIn) {
      setShowLoginModal(true);
      return;
    }

    // ✅ Step 2: If logged in, continue with original logic
    const {
      resetAutoSubmitGuard,
      getTimeLimit,
      setTimeLeft,
      setTimerStartedAt,
      setElapsedTime,
      persistProgressForLevel,
      startTimer,
    } = integrationsRef.current;

    resetAutoSubmitGuard();

    if (!selectedTech || !selectedLevel) return;
    if (!canRunStartAction("start")) return;

    const now = Date.now();
    const fullTime = getTimeLimit(selectedTech, selectedLevel);

    // Fresh identity for this attempt: every submission made from it (manual,
    // auto, retried) will carry this id, and any later "Start New Quiz" mints
    // a different one so repeat attempts stay separate results server-side.
    const attemptId = createAttemptId();

    setIsQuizStarted(true);
    setTimeLeft(fullTime);
    setTimerStartedAt(now);
    setElapsedTime(0);
    setCurrentQuestion(0);
    setUserAnswers({});
    setCompletedQuestions(new Set());
    setShowResults(false);
    setIsSubmitted(false);
    setReviewMode(false);
    setServerSummary(null);
    setReviewSnapshot(null);

    persistProgressForLevel(selectedTech, selectedLevel, {
      currentQuestion: 0,
      userAnswers: {},
      showResults: false,
      completedQuestions: [],
      isSubmitted: false,
      reviewMode: false,
      timeLeft: fullTime,
      timerStartedAt: now,
      elapsedTime: 0,
      isQuizStarted: true,
      attemptId,
      summary: null,
      reviewSnapshot: null,
    });

    startTimer();
  };

  // Resume Quiz: re-enter the saved unfinished attempt instead of creating a
  // new one. Answers, current question, completed-question bookkeeping and the
  // wall-clock elapsed time all come back from the stored record; the timer
  // interval itself is (re)started by useQuizTimer once this state commits, so
  // only one interval is ever live.
  const handleResumeQuiz = () => {
    if (!isSignedIn) {
      setShowLoginModal(true);
      return;
    }

    if (!selectedTech || !selectedLevel) return;

    const {
      progressByTech,
      isTimerRunning,
      saveTimerState,
      stopTimer,
      resetAutoSubmitGuard,
      getTimeLimit,
      setTimeLeft,
      setElapsedTime,
      persistProgressForLevel,
      startTimer,
    } = integrationsRef.current;

    const progress = progressByTech?.[selectedTech]?.[selectedLevel];

    // Nothing recoverable left in storage (cleared or replaced elsewhere):
    // fall back to a fresh attempt rather than resuming an empty session.
    if (!progress || typeof progress !== "object") {
      handleStartQuiz();
      return;
    }

    if (!canRunStartAction("resume")) return;

    // Defensive: make sure no stray interval survives into the resumed session.
    if (isTimerRunning) {
      saveTimerState?.();
      stopTimer?.();
    }

    // Re-arm the single-shot auto-submit guard for this attempt so an expired
    // saved attempt can still be submitted exactly once.
    resetAutoSubmitGuard?.();

    const questions = getQuestions(selectedTech, selectedLevel);
    const targetQuestion = clampQuestionIndex(
      progress.currentQuestion,
      questions.length,
    );
    const savedElapsed = Math.max(Number(progress.elapsedTime) || 0, 0);
    const remainingTime = resolveRemainingTime({
      timeLimit: getTimeLimit(selectedTech, selectedLevel),
      elapsedTime: progress.elapsedTime,
      timeLeft: progress.timeLeft,
    });

    setUserAnswers(
      progress.userAnswers && typeof progress.userAnswers === "object"
        ? progress.userAnswers
        : {},
    );
    setCompletedQuestions(
      new Set(
        Array.isArray(progress.completedQuestions)
          ? progress.completedQuestions
          : [],
      ),
    );
    setCurrentQuestion(targetQuestion);
    setShowResults(false);
    setIsSubmitted(false);
    setReviewMode(false);
    setServerSummary(null);
    setReviewSnapshot(null);
    setElapsedTime(savedElapsed);
    setTimeLeft(remainingTime);
    setIsQuizStarted(true);

    // Resume re-uses the identity of the attempt being resumed so a submit
    // that already happened (or is in flight) for it stays the same attempt.
    // Records saved before attempt ids existed pick one up here — persisted
    // below — so their submission is idempotent as well.
    const attemptId = getAttemptId(progress) ?? createAttemptId();

    persistProgressForLevel(selectedTech, selectedLevel, {
      ...progress,
      currentQuestion: targetQuestion,
      userAnswers:
        progress.userAnswers && typeof progress.userAnswers === "object"
          ? progress.userAnswers
          : {},
      showResults: false,
      isSubmitted: false,
      reviewMode: false,
      isQuizStarted: true,
      attemptId,
      summary: null,
      reviewSnapshot: null,
      elapsedTime: savedElapsed,
      timeLeft: remainingTime,
      timerStartedAt: remainingTime > 0 ? Date.now() : null,
    });

    if (remainingTime > 0) {
      startTimer();
    }
  };

  const handleTechSelect = (techId) => {
    const { isTimerRunning, saveTimerState, stopTimer, setTimeLeft, setTimerStartedAt, setElapsedTime } =
      integrationsRef.current;

    // Save current timer state before switching
    if (isTimerRunning) {
      saveTimerState();
    }

    if (selectedTech === techId) {
      setSelectedTech(null);
      setSelectedLevel(null);
      setCurrentQuestion(0);
      setUserAnswers({});
      setShowResults(false);
      setCompletedQuestions(new Set());
      setIsSubmitted(false);
      setReviewMode(false);
      setIsQuizStarted(false);
      setTimeLeft(0);
      setTimerStartedAt(null);
      setElapsedTime(0);
      setServerSummary(null);
      setReviewSnapshot(null);
      stopTimer();
    } else {
      setSelectedTech(techId);
      setSelectedLevel(null);
      setCurrentQuestion(0);
      setUserAnswers({});
      setShowResults(false);
      setCompletedQuestions(new Set());
      setIsSubmitted(false);
      setReviewMode(false);
      setIsQuizStarted(false);
      setTimeLeft(0);
      setTimerStartedAt(null);
      setElapsedTime(0);
      setServerSummary(null);
      setReviewSnapshot(null);
      stopTimer();
    }
  };

  const handleLevelSelect = (levelId) => {
    const {
      progressByTech,
      isTimerRunning,
      saveTimerState,
      stopTimer,
      getTimeLimit,
      setTimeLeft,
      setTimerStartedAt,
      setElapsedTime,
    } = integrationsRef.current;

    // Save current timer state before switching
    if (isTimerRunning) {
      saveTimerState();
      stopTimer();
    }

    setSelectedLevel(levelId);
    // Selecting a level always lands on the start screen. A saved unfinished
    // attempt is restored below but is only re-entered through Resume Quiz,
    // so reselecting the same tech+level can no longer silently drop the user
    // back into the quiz (nor wipe the saved answers with Start Quiz).
    setIsQuizStarted(false);

    const progress = progressByTech?.[selectedTech]?.[levelId];
    if (progress && typeof progress === "object") {
      const questions = getQuestions(selectedTech, levelId);
      const firstUnanswered = findFirstUnansweredIndex(
        progress.userAnswers || {},
        questions.length,
      );
      if (firstUnanswered >= 0) setCurrentQuestion(firstUnanswered);
      else
        setCurrentQuestion(
          clampQuestionIndex(progress.currentQuestion, questions.length),
        );

      setUserAnswers(progress.userAnswers || {});
      // A submitted attempt always comes back as the results screen, even if
      // the showResults flag was lost while navigating into review mode.
      setShowResults(
        Boolean(progress.isSubmitted || progress.showResults),
      );
      setCompletedQuestions(new Set(progress.completedQuestions || []));
      // IMPORTANT: set local isSubmitted/reviewMode from stored per-level progress
      setIsSubmitted(progress.isSubmitted || false);
      setReviewMode(progress.reviewMode || false);
      setElapsedTime(progress.elapsedTime || 0);
      setServerSummary(progress.summary || null);
      setReviewSnapshot(progress.reviewSnapshot || null);

      // Restore the attempt's countdown for display, but never start the
      // interval here: only an active quiz (Resume / Start) runs a timer, so
      // there is exactly one interval owner.
      setTimeLeft(
        resolveRemainingTime({
          timeLimit: getTimeLimit(selectedTech, levelId),
          elapsedTime: progress.elapsedTime,
          timeLeft: progress.timeLeft,
        }),
      );
      setTimerStartedAt(null);
    } else {
      setCurrentQuestion(0);
      setUserAnswers({});
      setShowResults(false);
      setCompletedQuestions(new Set());
      setIsSubmitted(false);
      setReviewMode(false);
      setIsQuizStarted(false);
      const fullTime = getTimeLimit(selectedTech, levelId);
      setTimeLeft(fullTime);
      setTimerStartedAt(null);
      setElapsedTime(0);
      setServerSummary(null);
      setReviewSnapshot(null);
    }
  };

  const confirmRestart = () => {
    const { stopTimer, getTimeLimit, setTimeLeft, setTimerStartedAt, setElapsedTime, persistProgressForLevel } =
      integrationsRef.current;

    // Stop and clear current timer
    stopTimer();

    // Reset all quiz states
    setCurrentQuestion(0);
    setUserAnswers({});
    setShowResults(false);
    setCompletedQuestions(new Set());
    setIsSubmitted(false);
    setReviewMode(false);
    setIsQuizStarted(false);
    setServerSummary(null);
    setReviewSnapshot(null);

    // Reset timer states with fresh start
    const fullTime = getTimeLimit(selectedTech, selectedLevel);
    setTimeLeft(fullTime);
    setTimerStartedAt(Date.now());
    setElapsedTime(0);

    // Don't start timer automatically - wait for user to click Start Quiz
    // Update progressByTech immediately for this level
    if (selectedTech && selectedLevel) {
      persistProgressForLevel(selectedTech, selectedLevel, {
        currentQuestion: 0,
        userAnswers: {},
        showResults: false,
        completedQuestions: [],
        isSubmitted: false,
        reviewMode: false,
        timeLeft: fullTime,
        timerStartedAt: Date.now(),
        elapsedTime: 0,
        isQuizStarted: false,
        // The abandoned attempt's identity is dropped here; the next
        // Start Quiz mints a fresh one (see handleStartQuiz).
        attemptId: null,
        summary: null,
        reviewSnapshot: null,
      });
    }
  };

  // =========================================================================
  // Question / answer state
  // =========================================================================

  const handleAnswerSelect = (answerIndex) => {
    if (!isQuizStarted || isSubmitted || reviewMode) return;

    const { progressByTech, persistProgressForLevel } = integrationsRef.current;

    const newAnswers = {
      ...userAnswers,
      [currentQuestion]: answerIndex,
    };

    setUserAnswers(newAnswers);

    const newCompleted = new Set(completedQuestions);
    newCompleted.add(currentQuestion);
    setCompletedQuestions(newCompleted);

    // ✅ REALTIME UPDATE (IMPORTANT)
    // currentQuestion is written too: navigation alone does not touch
    // localStorage, so without it a refresh after answering would restore the
    // position of the last write (usually the previous question).
    persistProgressForLevel(selectedTech, selectedLevel, {
      ...progressByTech[selectedTech]?.[selectedLevel],
      currentQuestion,
      userAnswers: newAnswers,
      completedQuestions: Array.from(newCompleted),
    });
  };

  // Persist the question the user just moved to. Only navigation inside a
  // started attempt writes; the record itself is created when the attempt
  // starts, so this can never resurrect a cleared or completed level.
  const persistCurrentQuestion = (index) => {
    if (!isQuizStarted || isSubmitted || reviewMode) return;

    const { progressByTech, persistProgressForLevel } = integrationsRef.current;
    const record = progressByTech?.[selectedTech]?.[selectedLevel];
    if (!record) return;

    persistProgressForLevel(selectedTech, selectedLevel, {
      ...record,
      currentQuestion: index,
    });
  };

  const handleQuestionNavigation = (direction) => {
    if (!isQuizStarted && !reviewMode) return; // Prevent navigation if quiz not started and not in review mode

    // Declared before both branches: the review/submitted branch below reads
    // `questions`, and a declaration placed after that branch would be in its
    // temporal dead zone for `direction === "next"` (a latent bug inherited
    // from the original Sidebar implementation).
    const questions = getQuestions();

    if (isSubmitted || reviewMode) {
      // Allow free navigation in review/submitted mode
      if (direction === "prev" && currentQuestion > 0)
        setCurrentQuestion(currentQuestion - 1);
      else if (direction === "next" && currentQuestion < questions.length - 1)
        setCurrentQuestion(currentQuestion + 1);
      return;
    }

    if (direction === "prev" && currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
      persistCurrentQuestion(currentQuestion - 1);
    } else if (direction === "next" && currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      persistCurrentQuestion(currentQuestion + 1);
    }
  };

  const handleDirectQuestionClick = (questionIndex) => {
    if (!isQuizStarted && !reviewMode) return; // Prevent clicking if quiz not started and not in review mode

    if (!isSubmitted && !reviewMode) {
      persistCurrentQuestion(questionIndex);
    }

    setCurrentQuestion(questionIndex);
  };

  // FIXED: Handle Review Mode properly
  const handleReviewMode = () => {
    const { stopTimer } = integrationsRef.current;
    const questions = getQuestions();

    if (!questions.length) return;

    setCurrentQuestion(0); // FIRST reset index

    setReviewMode(true);
    setShowResults(false);

    stopTimer();
  };

  return {
    // state
    selectedTech,
    setSelectedTech,
    selectedLevel,
    setSelectedLevel,
    isQuizStarted,
    setIsQuizStarted,
    currentQuestion,
    setCurrentQuestion,
    userAnswers,
    setUserAnswers,
    completedQuestions,
    setCompletedQuestions,
    showResults,
    setShowResults,
    isSubmitted,
    setIsSubmitted,
    reviewMode,
    setReviewMode,
    serverSummary,
    setServerSummary,
    reviewSnapshot,
    setReviewSnapshot,
    // helpers
    getQuestions,
    // lifecycle actions
    handleHomeClick,
    handleStartQuiz,
    handleResumeQuiz,
    handleTechSelect,
    handleLevelSelect,
    confirmRestart,
    // question / answer actions
    handleAnswerSelect,
    handleQuestionNavigation,
    handleDirectQuestionClick,
    handleReviewMode,
  };
}
