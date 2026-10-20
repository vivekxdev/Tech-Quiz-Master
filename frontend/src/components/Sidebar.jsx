import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import {
  BookOpen,
  Code,
  Database,
  Coffee,
  Cpu,
  Globe,
  Layout,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  XCircle,
  Award,
  Terminal,
  Trophy,
  Sparkles,
  Zap,
  Target,
  Menu,
  X,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Clock,
  AlertCircle,
  Eye,
  BarChart3,
  HelpCircle,
  PlayCircle,
} from "lucide-react";
import { useApi } from "../services/api/api.js";
import { useUser, useClerk } from "@clerk/clerk-react";
import {
  sidebarStyles,
  colorSchemes,
  getTimeColor,
  getQuestionStatusColor,
  getOptionButtonStyle,
  getTechScheme,
} from "../assets/dummyStyles (1).js";
import Button from "./ui/Button.jsx";
import Badge from "./ui/Badge.jsx";
import Card from "./ui/Card.jsx";
import Skeleton from "./ui/Skeleton.jsx";
import StatePanel from "./ui/StatePanel.jsx";
import { formatTime, formatElapsedTime } from "../utils/timeFormat.js";
import { loadSavedState } from "../utils/quizStorage.js";
import { getAttemptStatus } from "../utils/quizAttempt.js";
import { normalizeQuizzes } from "../utils/quizCatalog.js";
import { parseResultsPayload } from "../utils/quizResults.js";
import { getPerformanceStatus } from "../utils/performanceStatus.js";
import ConfirmDialog from "./sidebar/ConfirmDialog.jsx";
import DashboardHome from "./sidebar/DashboardHome.jsx";
import LoadingState from "./sidebar/LoadingState.jsx";
import TechSelectedState from "./sidebar/TechSelectedState.jsx";
import { useQuizTimer } from "../hooks/useQuizTimer.js";
import { useQuizPersistence } from "../hooks/useQuizPersistence.js";
import { useQuizSubmission } from "../hooks/useQuizSubmission.js";
import { useQuizSession } from "../hooks/useQuizSession.js";

// Mapping of technology to icons (using lucide-react icons as placeholders; replace with actual tech icons as needed)
const techIconMap = {
  html: Code,
  css: Layout,
  javascript: Zap,
  react: Cpu,
  node: Terminal,
  mongodb: Database,
  java: Coffee,
  python: Globe,
};
// For , Basic , Intermediate , Advance icon
const levelIconMap = {
  basic: Target,
  intermediate: Zap,
  advanced: Trophy,
};

const PERFORMANCE_ICONS = {
  scoreUnavailable: <AlertCircle aria-hidden="true" />,
  outstanding: <Sparkles aria-hidden="true" />,
  excellent: <Trophy aria-hidden="true" />,
  goodJob: <Award aria-hidden="true" />,
  keepPracticing: <BookOpen aria-hidden="true" />,
};
const Sidebar = () => {
  // Auth & User
  const { request } = useApi();
  const { isSignedIn } = useUser();
  const { openSignIn } = useClerk();
  const [showLoginModal, setShowLoginModal] = useState(false);
  // Api call
  // Variables and state
  const [questionsData, setQuestionsData] = useState({});
  const [technologies, setTechnologies] = useState([]);
  const [showRestartModal, setShowRestartModal] = useState(false);
  // Confirmation for "Start New Quiz" while an unfinished attempt is saved.
  const [showStartNewModal, setShowStartNewModal] = useState(false);

  // Load saved state from localStorage once on mount (migration support lives
  // in utils/quizStorage.js). Values below are only used to seed initial state.
  const [savedState] = useState(() => loadSavedState());

  // track window width for responsive behavior
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );

  // Late-bound persistence / timer / submission callbacks for useQuizSession.
  // The session hook is created first (persistence needs its session state),
  // so it reaches the later hooks through this ref, which is filled in a
  // layout effect together with the other cross-hook refs below.
  const sessionIntegrationsRef = useRef({});

  // Quiz session (selected tech/level, started/submitted/review/results state,
  // current question, answers, navigation & lifecycle handlers)
  const {
    selectedTech,
    selectedLevel,
    setSelectedLevel,
    isQuizStarted,
    setIsQuizStarted,
    currentQuestion,
    userAnswers,
    setUserAnswers,
    completedQuestions,
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
    getQuestions,
    handleHomeClick,
    handleStartQuiz,
    handleResumeQuiz,
    handleTechSelect: selectTechSession,
    handleLevelSelect: selectLevelSession,
    confirmRestart,
    handleAnswerSelect,
    handleQuestionNavigation,
    handleDirectQuestionClick,
    handleReviewMode,
  } = useQuizSession({
    savedState,
    questionsData,
    isSignedIn,
    setShowLoginModal,
    integrationsRef: sessionIntegrationsRef,
  });

  const selectedTechObj = React.useMemo(() => {
    return technologies.find((t) => t.id === selectedTech) || {};
  }, [technologies, selectedTech]);

  // Helper for level
  const getLevelsForTech = (tech) => {
    if (!questionsData[tech]) return [];

    // Get all level keys for this tech
    const levelKeys = Object.keys(questionsData[tech]);

    // Map each level to an object with its details
    const levels = levelKeys.map((level) => {
      const levelData = questionsData[tech][level]; // ← this line was missing
      const LevelIcon = levelIconMap[level?.toLowerCase()] || HelpCircle;

      return {
        id: level,
        name: level.charAt(0).toUpperCase() + level.slice(1),
        questions: levelData.questions?.length || 0,
        time: levelData.timeLimit ? `${levelData.timeLimit}m` : "",
        icon: <LevelIcon size={14} />,
      };
    });

    // Reverse so that oldest level appears first
    return levels.reverse();
  };

  // Auth gate for the saved-progress UI. Read-only: the setter's only callers
  // were handleLogin/clearAllProgress, which were removed as unreachable, so
  // the value can never change after mount.
  const isLoggedIn = !!savedState;

  // Sidebar responsive
  // NOTE: changed default breakpoint: sidebar is open by default on large screens >= 1024 (lg)
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    // default open on larger screens (lg+), closed on md/tablet & mobile
    windowWidth >= 1024,
  );
  const asideRef = useRef(null);

  // Quiz progress persistence (progressByTech, localStorage writes, per-level
  // progress lookups) lives in useQuizPersistence.
  const {
    progressByTech,
    persistProgressForLevel,
    saveTimerState,
    setTimerApi,
    getProgressForTechLevel,
    isTechLevelCompleted,
  } = useQuizPersistence({
    savedState,
    selectedTech,
    selectedLevel,
    questionsData,
    currentQuestion,
    userAnswers,
    showResults,
    completedQuestions,
    isSubmitted,
    reviewMode,
    isQuizStarted,
  });

  // Timer/submission callbacks are assigned in the layout effect below, after
  // useQuizTimer and useQuizSubmission, so they can read hook values.
  const onSaveTimerStateRef = useRef(null);
  const onTimeUpRef = useRef(null);

  const {
    timeLeft,
    isTimerRunning,
    elapsedTime,
    setTimeLeft,
    setTimerStartedAt,
    setElapsedTime,
    startTimer,
    stopTimer,
    resetTimer,
    calculateElapsedTime,
    getTimeLimit,
  } = useQuizTimer({
    selectedTech,
    selectedLevel,
    questionsData,
    isQuizStarted,
    isSubmitted,
    reviewMode,
    showResults,
    progressByTech,
    initialTimeLeft:
      savedState?.progressByTech?.[savedState?.currentTech]?.[
        savedState?.currentLevel
      ]?.timeLeft || 0,
    initialTimerStartedAt:
      savedState?.progressByTech?.[savedState?.currentTech]?.[
        savedState?.currentLevel
      ]?.timerStartedAt || null,
    initialElapsedTime:
      savedState?.progressByTech?.[savedState?.currentTech]?.[
        savedState?.currentLevel
      ]?.elapsedTime || 0,
    onTimeUp: () => onTimeUpRef.current?.(),
    onSaveTimerState: () => onSaveTimerStateRef.current?.(),
    onPersistLevel: persistProgressForLevel,
  });

  // Quiz catalog helper used by submission (the question list helper used by
  // navigation/submission lives in useQuizSession, which owns the selection)
  const getQuizId = (tech = selectedTech, level = selectedLevel) => {
    if (!tech || !level) return undefined;
    return questionsData[tech]?.[level]?.quizId;
  };

  // Quiz submission (manual confirm flow + timer auto-submit) lives in
  // useQuizSubmission. Both paths share one secure API pipeline and one
  // persistence payload; scoring stays on the server.
  const {
    showSubmitModal,
    setShowSubmitModal,
    handleSubmitQuiz,
    confirmSubmit,
    // True while a submit is in flight; the confirm dialog disables itself
    // so a double-click can't trigger a second POST.
    isSubmitting,
    handleTimeUp,
    resetAutoSubmitGuard,
  } = useQuizSubmission({
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
    // Read back by submission to send the attempt's idempotency key: manual
    // confirm and timer auto-submit must always use the persisted attempt id.
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
  });

  // Late-bind the callbacks that cross hook boundaries:
  //   useQuizTimer  -> useQuizPersistence (saveTimerState) + useQuizSubmission (time up)
  //   useQuizSession -> persistence / timer / submission
  // Written in a layout effect so every ref is current before any passive
  // effect or event handler runs (refs may not be written during render).
  useLayoutEffect(() => {
    // Hand the latest timer values to the persistence hook so saveTimerState
    // always persists the current timer state.
    setTimerApi({ timeLeft, isTimerRunning, calculateElapsedTime });
    onSaveTimerStateRef.current = saveTimerState;
    onTimeUpRef.current = handleTimeUp;
    sessionIntegrationsRef.current = {
      progressByTech,
      isTimerRunning,
      persistProgressForLevel,
      saveTimerState,
      resetAutoSubmitGuard,
      getTimeLimit,
      setTimeLeft,
      setTimerStartedAt,
      setElapsedTime,
      startTimer,
      stopTimer,
      resetTimer,
    };
  });

  // Sidebar-only wrappers: the session hook keeps the state transitions, the
  // component keeps the DOM/responsive side effects that follow them.
  const handleTechSelect = (techId) => {
    selectTechSession(techId);

    setTimeout(() => {
      const el = asideRef.current?.querySelector(`[data-tech="${techId}"]`);
      if (!el) return;
      // Honour reduced-motion: a smooth programmatic scroll is distracting
      // when the user has asked the OS/app to cut animations.
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
    }, 120);
  };

  const handleLevelSelect = (levelId) => {
    selectLevelSession(levelId);

    // For tablet & mobile (now < 1024) close sidebar to show full content
    if (windowWidth < 1024) setIsSidebarOpen(false);
  };

  // Dashboard "Continue": select that tech+level in one action so the
  // existing start screen offers its unchanged Resume Quiz / Start New Quiz
  // choice. Only reachable from the dashboard branch, where selectedTech is
  // always null — so the rail's same-tech toggle can never deselect it.
  const handleContinueAttempt = (techId, levelId) => {
    handleTechSelect(techId);
    handleLevelSelect(levelId);
  };

  // Show real data from db
  // `catalogError`/`catalogAttempt` drive the error + retry state below: a
  // failed catalog load used to leave an empty sidebar with no way forward.
  const [catalogError, setCatalogError] = useState(null);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  // True until the first catalog response lands so the dashboard never
  // advertises "0 Techs" while the request is still in flight.
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCatalogError(null);
    setCatalogLoading(true);

    const loadQuizzes = async () => {
      try {
        const data = await request("/admin/quizzes");
        if (cancelled) return;

        const normalized = normalizeQuizzes(data, {
          techIconMap,
          colorSchemes,
        });

        setQuestionsData(normalized.questionsData);
        setTechnologies(normalized.techList);
      } catch (err) {
        if (cancelled) return;
        console.error("FETCH ERROR:", err);
        setCatalogError(
          err?.message || "Something went wrong while loading the quizzes.",
        );
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    };

    loadQuizzes();

    return () => {
      cancelled = true;
    };
    // `request` gets a new identity on every render; listing it here would
    // refetch in a loop, so the load only re-runs on an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogAttempt]);

  // Dashboard performance snapshot: one fetch of the signed-in user's real
  // result history (the same /results/my-results endpoint My Result uses).
  // Signed-out users have no authenticated history, so nothing is fetched and
  // the dashboard renders no performance section; failures surface as an
  // honest inline error with retry instead of blocking the dashboard.
  const [perfAttempt, setPerfAttempt] = useState(0);
  const [perf, setPerf] = useState({
    status: "loading",
    results: [],
    message: "",
  });

  useEffect(() => {
    if (!isSignedIn) return undefined;

    let cancelled = false;
    setPerf({ status: "loading", results: [], message: "" });

    const loadPerformance = async () => {
      try {
        const data = await request("/results/my-results");
        if (cancelled) return;
        const parsed = parseResultsPayload(data);
        if (parsed.error) {
          setPerf({ status: "error", results: [], message: parsed.error });
        } else {
          setPerf({ status: "ready", results: parsed.results, message: "" });
        }
      } catch (err) {
        if (cancelled) return;
        setPerf({
          status: "error",
          results: [],
          message:
            err?.message ||
            "Something went wrong while loading your performance.",
        });
      }
    };

    loadPerformance();

    return () => {
      cancelled = true;
    };
    // `request` gets a new identity on every render; listing it here would
    // refetch in a loop, so the load only re-runs on sign-in change or an
    // explicit retry from the dashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, perfAttempt]);

  // Responsive sidebar open by default on lg+; also track window width
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      // change threshold to 1024 (lg) so tablet (md) behaves like mobile
      if (window.innerWidth >= 1024) setIsSidebarOpen(true);
      else setIsSidebarOpen(false);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prevent background scroll when overlay shown on small & medium screens (now < 1024)
  useEffect(() => {
    // we'll hide body scroll when sidebar is open on widths < 1024 to prevent layout shift
    if (isSidebarOpen && windowWidth < 1024) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen, windowWidth]);

  // Click outside to close sidebar (works on all sizes)
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        asideRef.current &&
        !asideRef.current.contains(e.target) &&
        isSidebarOpen &&
        // only close when screen is smaller than lg (so tablet+mobile) - keep normal desktop behaviour intact
        windowWidth < 1024
      ) {
        setIsSidebarOpen(false);
      }
    };

    const handleTouchStart = (e) => handleOutsideClick(e);

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleTouchStart);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleTouchStart);
    };
  }, [isSidebarOpen, windowWidth]);

  const toggleSidebar = () => setIsSidebarOpen((p) => !p);

  const restartQuiz = () => {
    if (!selectedTech || !selectedLevel) return;

    setShowRestartModal(true);
  };

  const questions = getQuestions();
  const currentQ = questions[currentQuestion];
  const score = serverSummary;

  // Saved-attempt classification for the selected level: drives whether the
  // start screen offers Start Quiz, or Resume Quiz + Start New Quiz.
  const levelProgress = getProgressForTechLevel(selectedTech, selectedLevel);
  const attemptStatus = getAttemptStatus(
    progressByTech?.[selectedTech]?.[selectedLevel],
  );
  const performance = getPerformanceStatus(score);
  const performanceIcon = PERFORMANCE_ICONS[performance.iconKey];

  // Resumable attempts across every tech+level, so an unfinished quiz is
  // discoverable from the dashboard without drilling into the rail first.
  // Techs missing from the catalog are skipped (nothing selectable to
  // continue into); getAttemptStatus already rejects corrupt records.
  const continueItems = [];
  for (const tech of technologies) {
    const levels = progressByTech?.[tech.id];
    if (!levels || typeof levels !== "object") continue;

    for (const [levelId, record] of Object.entries(levels)) {
      if (getAttemptStatus(record) !== "resumable") continue;

      const progress = getProgressForTechLevel(tech.id, levelId);
      continueItems.push({
        techId: tech.id,
        techName: tech.name || tech.id,
        levelId,
        levelName: levelId.charAt(0).toUpperCase() + levelId.slice(1),
        answered: progress.answered,
        total: progress.total,
        elapsedSeconds: Math.max(Number(record?.elapsedTime) || 0, 0),
        icon: tech.icon || null,
        scheme: getTechScheme(tech.id),
      });
    }
  }

  // Get time color based on remaining time
  const timeColor = getTimeColor(
    timeLeft,
    getTimeLimit(selectedTech, selectedLevel),
    isSubmitted,
    reviewMode,
  );

  // Get question status
  const getQuestionStatus = (index) => {
    const question = questions[index];

    if (!question) return "unattempted";

    const answer = userAnswers[index];

    if (answer === undefined || answer === -1) {
      return "unattempted";
    }

    // Correctness only exists in the server review snapshot; during the quiz
    // the indicator grid is styled neutral regardless of the returned value.
    const reviewEntry = reviewSnapshot?.[index];
    if (!reviewEntry) return "unattempted";
    return reviewEntry.isCorrect ? "correct" : "incorrect";
  };

  // Get answer feedback for current question (server review snapshot only)
  const getAnswerFeedback = () => {
    if (!currentQ) return null;

    const reviewEntry = reviewSnapshot?.[currentQuestion] ?? null;
    const userAnswer = reviewEntry
      ? reviewEntry.selectedAnswer
      : userAnswers[currentQuestion];

    return {
      userAnswer,
      isCorrect: reviewEntry ? reviewEntry.isCorrect : false,
      isUnattempted: reviewEntry
        ? reviewEntry.selectedAnswer === -1
        : userAnswer === undefined || userAnswer === -1,
      correctAnswer: reviewEntry ? reviewEntry.correctAnswer : null,
      correctnessKnown: !!reviewEntry,
    };
  };

  const answerFeedback = getAnswerFeedback();

  // compute boolean for "is mobile" usage in markup
  // NOTE: treat widths < 1024 (lg) as mobile/tablet for layout/overlay behavior
  const isMobile = windowWidth < 1024;

  // ======= New small UI additions (non-functional) =======
  // Determine if current question is filled (answered) so we can show blue light
  const isCurrentAnswered =
    userAnswers[currentQuestion] !== undefined &&
    userAnswers[currentQuestion] !== -1;

  // UI PART
  return (
    <div className={sidebarStyles.container}>
      {/* overlay when sidebar open on small/medium screens */}
      {isSidebarOpen && windowWidth < 1024 && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className={sidebarStyles.overlay}
          aria-hidden
        />
      )}

      <div className={sidebarStyles.flexContainer}>
        {/* Sidebar */}
        <aside
          ref={asideRef}
          className={`${sidebarStyles.sidebar} ${
            isSidebarOpen
              ? sidebarStyles.sidebarOpen
              : sidebarStyles.sidebarClosed
          }`}
          aria-hidden={!isSidebarOpen && isMobile}
          // A closed drawer must leave the tab order, not just the a11y tree.
          inert={!isSidebarOpen && isMobile ? true : undefined}
        >
          {/* Sidebar Header */}

          <div className={sidebarStyles.sidebarHeader}>
            <div className={sidebarStyles.headerContent}>
              <div
                className={`${sidebarStyles.logoContainer} cursor-pointer hover:opacity-80 transition-opacity`}
                role="button"
                tabIndex={0}
                aria-label="Go to home"
                onClick={handleHomeClick}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleHomeClick();
                  }
                }}
              >
                <div className={sidebarStyles.logoIcon}>
                  <BookOpen size={28} />
                </div>
                <div>
                  <h1 className={sidebarStyles.title}>Tech Quiz Master</h1>
                  <p className={sidebarStyles.subtitle}>Test • Learn • Grow</p>
                </div>
              </div>

              {/* Close button for small/tablet screens */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className={sidebarStyles.closeButton}
                  aria-label="Close sidebar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar Content */}
          <div className={sidebarStyles.sidebarContent}>
            <div className={sidebarStyles.techSectionHeader}>
              <h2 className={sidebarStyles.techTitle}>
                <span className={sidebarStyles.techTitleAccent}></span>
                Technologies
              </h2>
              <span className={sidebarStyles.techCountBadge}>
                {catalogLoading ? "…" : `${technologies.length} Techs`}
              </span>
            </div>

            {technologies.map((tech) => {
              const Icon = tech.icon;
              const scheme = getTechScheme(tech.id);
              const isTechSelected = selectedTech === tech.id;

              return (
                <div key={tech.id} className="mb-3" data-tech={tech.id}>
                  <button
                    type="button"
                    onClick={() => handleTechSelect(tech.id)}
                    className={`${sidebarStyles.techButton} ${
                      isTechSelected
                        ? sidebarStyles.techButtonSelected
                        : sidebarStyles.techButtonUnselected
                    }`}
                    aria-pressed={isTechSelected}
                    aria-expanded={isTechSelected}
                  >
                    <div className={sidebarStyles.techIconContainer}>
                      <span className={`${sidebarStyles.techIcon} ${scheme.color}`}>
                        {Icon && <Icon size={20} />}
                      </span>
                      <span className={sidebarStyles.techName}>
                        {tech.name}
                      </span>

                      {/* Real completion count: levels of this tech where
                          every question has an answered record. */}
                      {(() => {
                        const levelsForTech = getLevelsForTech(tech.id);
                        const completedCount = levelsForTech.filter((level) =>
                          isTechLevelCompleted(tech.id, level.id),
                        ).length;

                        return completedCount > 0 ? (
                          <span
                            className={sidebarStyles.techProgressPill}
                            title={`${completedCount} of ${levelsForTech.length} levels completed`}
                          >
                            {completedCount}/{levelsForTech.length}
                          </span>
                        ) : null;
                      })()}
                    </div>

                    <span className={sidebarStyles.techChevron} aria-hidden="true">
                      {isTechSelected ? (
                        <ChevronDown size={18} />
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </span>
                  </button>

                  {selectedTech === tech.id && (
                    <div className={sidebarStyles.levelContainer}>
                      {getLevelsForTech(tech.id).map((level) => {
                        const progress = getProgressForTechLevel(
                          tech.id,
                          level.id,
                        );
                        const isCompleted = isTechLevelCompleted(
                          tech.id,
                          level.id,
                        );
                        // Data-driven availability: a catalog level without
                        // questions cannot be attempted, so it never starts.
                        const unavailable = level.questions === 0;

                        return (
                          <button
                            type="button"
                            key={level.id}
                            onClick={() =>
                              !unavailable && handleLevelSelect(level.id)
                            }
                            disabled={unavailable}
                            className={`${sidebarStyles.levelButton} ${
                              unavailable
                                ? sidebarStyles.levelButtonUnavailable
                                : selectedLevel === level.id
                                  ? sidebarStyles.levelButtonSelected
                                  : sidebarStyles.levelButtonUnselected
                            }`}
                            aria-pressed={selectedLevel === level.id}
                            aria-disabled={unavailable || undefined}
                          >
                            {/* ROW 1 — identity + question count */}
                            <div className={sidebarStyles.levelRow}>
                              <div className={sidebarStyles.levelIdentity}>
                                <div
                                  className={`${sidebarStyles.levelIconTile} ${
                                    unavailable
                                      ? sidebarStyles.levelIconTileUnavailable
                                      : selectedLevel === level.id
                                        ? sidebarStyles.levelIconTileSelected
                                        : sidebarStyles.levelIconTileUnselected
                                  }`}
                                >
                                  {level.icon}
                                </div>

                                <span
                                  className={`${sidebarStyles.levelName} ${
                                    unavailable
                                      ? sidebarStyles.levelNameUnavailable
                                      : ""
                                  }`}
                                >
                                  {level.name}
                                </span>
                              </div>

                              <span
                                className={`${sidebarStyles.pill} ${
                                  unavailable
                                    ? sidebarStyles.pillUnavailable
                                    : ""
                                }`}
                              >
                                {unavailable
                                  ? "No questions yet"
                                  : `${level.questions} Qs`}
                              </span>
                            </div>

                            {/* ROW 2 — time, answered, completed */}
                            {!unavailable && (
                              <div className={sidebarStyles.levelMeta}>
                                {level.time && (
                                  <span
                                    className={`${sidebarStyles.pill} ${sidebarStyles.pillTime}`}
                                  >
                                    <Clock size={12} aria-hidden="true" />
                                    {level.time}
                                  </span>
                                )}

                                {progress.answered > 0 && (
                                  <span
                                    className={`${sidebarStyles.pill} ${sidebarStyles.pillAnswered}`}
                                  >
                                    {progress.answered}/{progress.total}{" "}
                                    answered
                                  </span>
                                )}

                                {isCompleted && (
                                  <span
                                    className={`${sidebarStyles.pill} ${sidebarStyles.pillCompleted}`}
                                  >
                                    Completed
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Sidebar Footer */}
            <div className={sidebarStyles.sidebarFooter}>
              <div className="flex flex-col space-y-3">
                <div className={sidebarStyles.footerTextContainer}>
                  <p className={sidebarStyles.footerText1}>
                    Master your skills one quiz at a time
                  </p>
                  <p className={sidebarStyles.footerText2}>
                    Keep Learning, Keep Growing!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={sidebarStyles.mainContent}>
          {/* Mobile/Header with hamburger - now visible on tablet (md) and mobile */}
          <div className={sidebarStyles.mobileHeader}>
            <button
              onClick={toggleSidebar}
              className={sidebarStyles.hamburgerButton}
              aria-label="Toggle sidebar"
              aria-expanded={isSidebarOpen}
            >
              <Menu size={20} />
            </button>
          </div>

          {/* Mobile/Tablet Level Selection lives in the difficulty screen
              (TechSelectedState) as full level cards; the old horizontal
              strip duplicated that choice, so it was removed. */}

          {catalogLoading && technologies.length === 0 && !catalogError ? (
            // The catalog is still arriving: an announcing placeholder instead
            // of a dashboard that claims there are zero quizzes.
            <Card
              className={sidebarStyles.loadingCard}
              role="status"
              aria-live="polite"
            >
              <div
                className={sidebarStyles.loadingSpinner}
                aria-hidden="true"
              />
              <p className={sidebarStyles.loadingText}>Loading quizzes…</p>
              <div className={sidebarStyles.loadingSkeletonGrid}>
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </Card>
          ) : catalogError && technologies.length === 0 ? (
            // The quiz catalog never arrived: without this the sidebar would
            // sit on an empty/loading screen with no way to recover.
            <StatePanel
              tone="danger"
              icon={<AlertCircle size={22} aria-hidden="true" />}
              title="Couldn't load quizzes"
              message={catalogError}
            >
              <Button
                type="button"
                onClick={() => setCatalogAttempt((attempt) => attempt + 1)}
              >
                Try again
              </Button>
            </StatePanel>
          ) : !selectedTech ? (
            <DashboardHome
              continueItems={continueItems}
              onContinue={handleContinueAttempt}
              showPerformance={isSignedIn}
              performance={perf}
              onRetryPerformance={() =>
                setPerfAttempt((attempt) => attempt + 1)
              }
            />
          ) : !selectedLevel ? (
            <TechSelectedState
              selectedTechObj={selectedTechObj}
              selectedTech={selectedTech}
              getLevelsForTech={getLevelsForTech}
              getProgressForTechLevel={getProgressForTechLevel}
              isTechLevelCompleted={isTechLevelCompleted}
              handleLevelSelect={handleLevelSelect}
            />
          ) : showResults ? (
            <div className={sidebarStyles.resultsScreen}>
              <Card className={sidebarStyles.resultsCard}>
                <div className={sidebarStyles.resultsHeader}>
                  <div
                    className={`${sidebarStyles.resultsIconContainer} ${performance.color} ${performance.textColor}`}
                  >
                    {performanceIcon}
                  </div>
                  <h2 className={sidebarStyles.resultsTitle}>
                    Quiz Completed!
                  </h2>
                  <p className={sidebarStyles.resultsSubtitle}>
                    You've completed the {selectedLevel} level of{" "}
                    {selectedTechObj?.name?.charAt(0).toUpperCase() +
                      selectedTechObj?.name?.slice(1)}
                  </p>
                  <div
                    className={`${sidebarStyles.performanceBadge} ${performance.color} ${performance.textColor}`}
                  >
                    {performance.text}
                  </div>

                  {/* ADDED: Time Taken Display */}
                  <div className={sidebarStyles.timeTakenContainer}>
                    <div className={sidebarStyles.timeTakenHeader}>
                      <Clock
                        size={20}
                        className={sidebarStyles.timeTakenIcon}
                      />
                      <span className={sidebarStyles.timeTakenText}>
                        Time Taken: {formatElapsedTime(elapsedTime)}
                      </span>
                    </div>
                    <div className={sidebarStyles.timeTakenSubtext}>
                      You completed the quiz in {formatElapsedTime(elapsedTime)}
                    </div>
                  </div>

                  {score ? (
                    <>
                  <div className={sidebarStyles.scoreCardsGrid}>
                    {(() => {
                      const success = sidebarStyles.scoreCardTone("success");
                      const danger = sidebarStyles.scoreCardTone("danger");
                      const neutral = sidebarStyles.scoreCardTone("neutral");
                      const cards = [
                        {
                          tone: success,
                          Icon: CheckCircle,
                          value: score.correct,
                          label: "Correct Answers",
                        },
                        {
                          tone: danger,
                          Icon: XCircle,
                          value: score.incorrect,
                          label: "Incorrect Answers",
                        },
                        {
                          tone: neutral,
                          Icon: AlertCircle,
                          value: score.unattempted,
                          label: "Unattempted",
                        },
                      ];
                      return cards.map((card) => {
                        const { tone, Icon, value, label } = card;
                        return (
                        <div
                          key={label}
                          className={`${sidebarStyles.scoreCard} ${tone.card}`}
                        >
                          <div
                            className={`${sidebarStyles.scoreCardIconContainer} ${tone.icon}`}
                          >
                            <Icon size={24} aria-hidden="true" />
                          </div>
                          <p
                            className={`${sidebarStyles.scoreCardNumber} ${tone.number}`}
                          >
                            {value}
                          </p>
                          <p
                            className={`${sidebarStyles.scoreCardLabel} ${tone.label}`}
                          >
                            {label}
                          </p>
                        </div>
                        );
                      });
                    })()}
                  </div>

                  <div className={sidebarStyles.overallScoreContainer}>
                    <div className={sidebarStyles.overallScoreHeader}>
                      <span className={sidebarStyles.overallScoreLabel}>
                        Overall Score
                      </span>
                      <span className={sidebarStyles.overallScoreValue}>
                        {score.percentage}%
                      </span>
                    </div>
                    <div
                      className={sidebarStyles.progressBarContainer}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={score.percentage}
                      aria-label="Overall score"
                    >
                      <div
                        className={`${sidebarStyles.progressBar} ${
                          score.percentage >= 80
                            ? "bg-success"
                            : score.percentage >= 60
                              ? "bg-warning"
                              : "bg-danger"
                        }`}
                        style={{ width: `${score.percentage}%` }}
                      />
                    </div>
                    <div className={sidebarStyles.scoreDescription}>
                      Score based on {score.correct} correct out of{" "}
                      {score.total} questions
                    </div>
                  </div>
                    </>
                  ) : (
                    <div className={sidebarStyles.overallScoreContainer}>
                      <div className={sidebarStyles.scoreDescription}>
                        Score unavailable — this submission could not be
                        saved to the server.
                      </div>
                    </div>
                  )}

                  <div className={sidebarStyles.resultsButtonsContainer}>
                    {reviewSnapshot && (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleReviewMode}
                      >
                        <Eye size={18} aria-hidden="true" />
                        <span>Review Questions</span>
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={restartQuiz}
                    >
                      <RotateCcw size={18} aria-hidden="true" />
                      <span>Restart Quiz</span>
                    </Button>

                    <Button type="button" variant="ghost" onClick={handleHomeClick}>
                      <ArrowLeft size={18} aria-hidden="true" />
                      <span>Back to Home</span>
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          ) : !isQuizStarted && !reviewMode && selectedTech && selectedLevel ? (
            // Start Quiz Screen
            <div className={sidebarStyles.startQuizScreen}>
              <Card className={sidebarStyles.startQuizCard}>
                <div className={sidebarStyles.startQuizHeader}>
                  <div className={sidebarStyles.startQuizIconContainer}>
                    <PlayCircle size={48} />
                  </div>
                  <h2 className={sidebarStyles.startQuizTitle}>
                    Ready to Start?
                  </h2>
                  <p className={sidebarStyles.startQuizSubtitle}>
                    Get ready for the {selectedLevel} level of{" "}
                    {selectedTechObj?.name?.charAt(0).toUpperCase() +
                      selectedTechObj?.name?.slice(1)}{" "}
                    quiz
                  </p>

                  <div className={sidebarStyles.quizInfoCard}>
                    <div className={sidebarStyles.quizInfoHeader}>
                      <div className={sidebarStyles.techDisplay}>
                        <div
                          className={`${sidebarStyles.techDisplayIcon} ${selectedTechObj?.color || ""}`}
                        >
                          {(() => {
                            const Icon = selectedTechObj.icon;
                            return Icon ? <Icon size={28} /> : null;
                          })()}
                        </div>
                        <div className={sidebarStyles.techDisplayText}>
                          <p className={sidebarStyles.techDisplayName}>
                            {selectedTechObj.name}
                          </p>
                          <p className={sidebarStyles.techDisplayLevel}>
                            {selectedLevel.charAt(0).toUpperCase() +
                              selectedLevel.slice(1)}{" "}
                            Level
                          </p>
                        </div>
                      </div>

                      <div className={sidebarStyles.quizStats}>
                        <div className={sidebarStyles.statItem}>
                          <div className={sidebarStyles.statNumber}>
                            {questions.length}
                          </div>
                          <div className={sidebarStyles.statLabel}>
                            Questions
                          </div>
                        </div>

                        {getTimeLimit(selectedTech, selectedLevel) > 0 && (
                          <div className={sidebarStyles.statItem}>
                            <div className={sidebarStyles.statNumber}>
                              <Clock size={16} className="mr-1" />
                              {getTimeLimit(selectedTech, selectedLevel) / 60}{" "}
                              min
                            </div>
                            <div className={sidebarStyles.statLabel}>
                              Time Limit
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={sidebarStyles.instructionsContainer}>
                      <h4 className={sidebarStyles.instructionsTitle}>
                        Quiz Instructions:
                      </h4>
                      <ul className={sidebarStyles.instructionsList}>
                        <li className={sidebarStyles.instructionItem}>
                          <CheckCircle
                            size={14}
                            className={sidebarStyles.instructionCheck}
                          />
                          Answer all questions within the time limit
                        </li>

                        <li className={sidebarStyles.instructionItem}>
                          <CheckCircle
                            size={14}
                            className={sidebarStyles.instructionCheck}
                          />
                          Timer starts immediately when you click "Start Quiz"
                        </li>
                        <li className={sidebarStyles.instructionItem}>
                          <CheckCircle
                            size={14}
                            className={sidebarStyles.instructionCheck}
                          />
                          Your progress is saved automatically
                        </li>
                      </ul>
                    </div>
                  </div>

                  {attemptStatus === "resumable" ? (
                    <div
                      className={sidebarStyles.progressWarning}
                      role="status"
                    >
                      <p className={sidebarStyles.warningText}>
                        You have an unfinished attempt
                        {levelProgress.answered > 0
                          ? ` (${levelProgress.answered} of ${levelProgress.total} answered)`
                          : ""}
                        . Resume to continue exactly where you left off, or
                        start a new attempt to replace it.
                      </p>
                    </div>
                  ) : (
                    levelProgress.answered > 0 && (
                      <div className={sidebarStyles.progressWarning}>
                        <p className={sidebarStyles.warningText}>
                          You have previously answered{" "}
                          {levelProgress.answered} questions. Starting fresh
                          will reset your progress.
                        </p>
                      </div>
                    )
                  )}

                  {!isSignedIn && (
                    <div className={sidebarStyles.signedOutNote} role="note">
                      <p className={sidebarStyles.signedOutNoteText}>
                        You'll be asked to sign in before the quiz starts.
                        Attempts and results are tied to your account.
                      </p>
                    </div>
                  )}

                  <div className={sidebarStyles.startButtonsContainer}>
                    {attemptStatus === "resumable" ? (
                      <>
                        <Button
                          type="button"
                          variant="primary"
                          size="lg"
                          onClick={handleResumeQuiz}
                          aria-label="Resume Quiz"
                        >
                          <PlayCircle size={20} aria-hidden="true" />
                          <span>Resume Quiz</span>
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          size="lg"
                          onClick={() => setShowStartNewModal(true)}
                          aria-label="Start New Quiz"
                        >
                          <RotateCcw size={20} aria-hidden="true" />
                          <span>Start New Quiz</span>
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        onClick={handleStartQuiz}
                        aria-label="Start Quiz"
                      >
                        <PlayCircle size={20} aria-hidden="true" />
                        <span>Start Quiz</span>
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      onClick={() => {
                        setSelectedLevel(null);
                        setIsQuizStarted(false);
                      }}
                      aria-label="Change Level"
                    >
                      Change Level
                    </Button>
                  </div>

                  {/* The two resume-era actions differ in what they keep:
                      say so under the buttons instead of only in the dialog. */}
                  {attemptStatus === "resumable" && (
                    <div className={sidebarStyles.startButtonsCaptions}>
                      <span className={sidebarStyles.startButtonCaption}>
                        Resume keeps your saved answers and remaining time
                      </span>
                      <span className={sidebarStyles.startButtonCaption}>
                        Start new replaces your saved attempt
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          ) : currentQ && (isQuizStarted || reviewMode) ? (
            // Quiz in progress OR Review Mode
            <div className={sidebarStyles.quizContainer}>
              {/* Timer and progress bar */}
              <div className={sidebarStyles.quizHeaderCard}>
                <div className={sidebarStyles.quizHeader}>
                  <h1 className={sidebarStyles.quizTitle}>
                    {selectedTechObj?.name?.charAt(0).toUpperCase() +
                      selectedTechObj?.name?.slice(1)}{" "}
                    -{" "}
                    {selectedLevel.charAt(0).toUpperCase() +
                      selectedLevel.slice(1)}{" "}
                    {reviewMode && (
                      <span className={sidebarStyles.reviewModeBadge}>
                        Review Mode
                      </span>
                    )}
                  </h1>
                  <div className={sidebarStyles.statsGrid}>
                    {/* Timer display */}
                    <div
                      className={`${sidebarStyles.timerDisplay} ${timeColor}`}
                      role="timer"
                      aria-label={`Time remaining ${
                        isSubmitted || reviewMode
                          ? "00:00"
                          : formatTime(timeLeft)
                      }`}
                    >
                      <Clock size={16} aria-hidden="true" />
                      <span className={sidebarStyles.timerText}>
                        {isSubmitted || reviewMode
                          ? "00:00"
                          : formatTime(timeLeft)}
                      </span>
                    </div>
                    <span className={sidebarStyles.questionBadge}>
                      Question {currentQuestion + 1} of {questions.length}
                    </span>
                    {isLoggedIn && selectedLevel && (
                      <div className={sidebarStyles.progressList}>
                        {(() => {
                          const progress = getProgressForTechLevel(
                            selectedTech,
                            selectedLevel,
                          );
                          if (progress.answered > 0) {
                            return (
                              <div className={sidebarStyles.progressItem}>
                                <p className={sidebarStyles.progressText}>
                                  {selectedLevel.charAt(0).toUpperCase() +
                                    selectedLevel.slice(1)}
                                  : {progress.answered}/{progress.total}{" "}
                                  questions answered
                                </p>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={sidebarStyles.mainProgressBarContainer}
                  aria-hidden="true"
                >
                  <div
                    className={sidebarStyles.mainProgressBar}
                    style={{
                      width: `${((currentQuestion + 1) / (questions.length || 1)) * 100}%`,
                    }}
                  />
                </div>

                {/* Question status indicators */}
                <div
                  className={sidebarStyles.questionIndicators}
                  role="group"
                  aria-label="Question navigator"
                >
                  {questions.map((_, index) => {
                    const isCurrent = index === currentQuestion;
                    const status = getQuestionStatus(index);
                    const isAnswered =
                      userAnswers[index] !== undefined &&
                      userAnswers[index] !== -1;

                    const statusColors = getQuestionStatusColor(
                      status,
                      reviewMode,
                      isAnswered,
                    );

                    return (
                      <button
                        type="button"
                        key={index}
                        onClick={() => handleDirectQuestionClick(index)}
                        className={`${sidebarStyles.questionIndicator} ${statusColors.bgColor} ${statusColors.textColor} ${
                          isCurrent ? sidebarStyles.currentQuestion : ""
                        }`}
                        title={`Question ${index + 1}`}
                        aria-label={`Go to question ${index + 1}${
                          isCurrent ? ", current question" : ""
                        }`}
                        aria-current={isCurrent ? "step" : undefined}
                        disabled={!isQuizStarted && !reviewMode}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>

                {/* Time warning */}
                {!isSubmitted && !reviewMode && timeLeft < 60 && (
                  <div className={sidebarStyles.timeWarning} role="status">
                    <AlertCircle
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    Less than 1 minute remaining!
                  </div>
                )}
              </div>

              {/* Question Card */}
              <div
                className={`${sidebarStyles.questionCard} ${
                  isCurrentAnswered ? sidebarStyles.questionCardAnswered : ""
                }`}
              >
                {/* Question status badge */}
                <div className={sidebarStyles.questionHeader}>
                  <div className={sidebarStyles.questionIconContainer}>
                    <div className={sidebarStyles.questionIcon}>
                      <Target size={24} />
                    </div>
                    <div className="min-w-0">
                      <p className={sidebarStyles.questionEyebrow}>
                        Question {currentQuestion + 1}
                      </p>
                      <h2 className={sidebarStyles.questionTextContainer}>
                        {currentQ.question}
                      </h2>
                    </div>
                  </div>

                  {/* Show status badge only in review mode */}
                  {reviewMode ? (
                    <Badge
                      tone={
                        answerFeedback.correctnessKnown === false
                          ? "neutral"
                          : answerFeedback.isCorrect
                            ? "success"
                            : answerFeedback.userAnswer !== undefined &&
                                answerFeedback.userAnswer !== -1
                              ? "danger"
                              : "warning"
                      }
                      className="shrink-0"
                    >
                      {answerFeedback.correctnessKnown === false
                        ? "Result unavailable"
                        : answerFeedback.isCorrect
                          ? "Correct"
                          : answerFeedback.userAnswer !== undefined &&
                              answerFeedback.userAnswer !== -1
                            ? "Incorrect"
                            : "Unattempted"}
                    </Badge>
                  ) : null}
                </div>

                {/* Options */}
                <p className={sidebarStyles.optionsHint}>Choose one answer</p>
                <div
                  className={sidebarStyles.optionsContainer}
                  role="group"
                  aria-label="Answer options"
                >
                  {currentQ?.options?.map((option, index) => {
                    const isSelected = userAnswers[currentQuestion] === index;
                    // Correctness comes from the server review snapshot only;
                    // without it no option can be marked correct.
                    const reviewEntry = reviewMode
                      ? reviewSnapshot?.[currentQuestion]
                      : null;
                    const correctAnswer = reviewEntry
                      ? reviewEntry.correctAnswer
                      : null;
                    const isCorrect =
                      correctAnswer !== null && index === correctAnswer;
                    const showFeedback = reviewMode || isSubmitted; // Only in review mode

                    const optionStyle = getOptionButtonStyle(
                      isSelected,
                      isCorrect,
                      showFeedback,
                    );

                    const canChoose =
                      isQuizStarted && !isSubmitted && !reviewMode;

                    const hoverClass = !canChoose
                      ? sidebarStyles.optionButtonDisabled
                      : isSelected
                        ? sidebarStyles.optionButtonSelectedHover
                        : sidebarStyles.optionButtonHover;

                    return (
                      <button
                        type="button"
                        key={index}
                        onClick={() => handleAnswerSelect(index)}
                        disabled={!canChoose}
                        className={`${sidebarStyles.optionButton} ${optionStyle.buttonClass} ${hoverClass}`}
                        aria-pressed={isSelected}
                        aria-label={`${option}${
                          showFeedback && isCorrect
                            ? ", correct answer"
                            : isSelected
                              ? ", your answer"
                              : ""
                        }`}
                      >
                        <div className={sidebarStyles.optionContent}>
                          <div
                            className={`${sidebarStyles.optionRadio} ${optionStyle.radioClass}`}
                          >
                            {!showFeedback && isSelected && (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                            {showFeedback &&
                              (isCorrect ? (
                                <CheckCircle size={16} className="text-white" />
                              ) : isSelected ? (
                                <XCircle size={16} className="text-white" />
                              ) : null)}
                          </div>
                          <span
                            className={`${sidebarStyles.optionText} ${optionStyle.textClass}`}
                          >
                            {option}
                          </span>

                          {showFeedback && isCorrect && (
                            <Badge tone="success" className="ml-auto">
                              Correct answer
                            </Badge>
                          )}
                          {showFeedback && isSelected && !isCorrect && (
                            <Badge tone="danger" className="ml-auto">
                              Your answer
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Explanation for review mode */}
                {reviewMode && (
                  <div className={sidebarStyles.explanationContainer}>
                    <div className={sidebarStyles.explanationHeader}>
                      <BarChart3
                        size={20}
                        className={sidebarStyles.explanationIcon}
                      />
                      <span className={sidebarStyles.explanationTitle}>
                        Explanation
                      </span>
                    </div>
                    <div className={sidebarStyles.explanationContent}>
                      <p className={sidebarStyles.explanationText}>
                        {answerFeedback.correctnessKnown === false
                          ? " The correct answer is unavailable for this saved session."
                          : answerFeedback.isCorrect
                            ? " Your answer is correct!"
                            : answerFeedback.userAnswer !== undefined &&
                                answerFeedback.userAnswer !== -1
                              ? ` Your answer was incorrect. The correct answer is option ${answerFeedback.correctAnswer + 1}.`
                              : ` This question was unattempted. The correct answer is option ${answerFeedback.correctAnswer + 1}.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation Buttons */}
              <div className={sidebarStyles.navButtonsContainer}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleQuestionNavigation("prev")}
                  disabled={
                    currentQuestion === 0 || (!isQuizStarted && !reviewMode)
                  }
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                  <span>Previous Question</span>
                </Button>

                <div className={sidebarStyles.navRightContainer}>
                  {/* Forward navigation is offered during the quiz AND in review
                      mode: handleQuestionNavigation already bounds both, and
                      review used to render Previous without Next, so the only
                      way forward was the numbered navigator. */}
                  {(isQuizStarted || reviewMode) &&
                    currentQuestion < questions.length - 1 && (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => handleQuestionNavigation("next")}
                      >
                        <span>Next Question</span>
                        <ArrowRight size={18} aria-hidden="true" />
                      </Button>
                    )}

                  {/* Submit/Results button - Only show in quiz mode, not review mode */}
                  {questions.length > 0 && isQuizStarted && !reviewMode && (
                    <Button
                      type="button"
                      variant={
                        !isSignedIn
                          ? "dark"
                          : isSubmitted
                            ? "secondary"
                            : "primary"
                      }
                      onClick={!isSignedIn ? openSignIn : handleSubmitQuiz}
                    >
                      {!isSignedIn
                        ? "Login to Submit"
                        : isSubmitted
                          ? "See Results"
                          : "Submit Quiz"}
                    </Button>
                  )}

                  {/* In review mode, show "Back to Results" button */}
                  {reviewMode && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setReviewMode(false);
                        setShowResults(true);
                      }}
                    >
                      Back to Results
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <LoadingState />
          )}
        </main>
      </div>
      {showSubmitModal && (
        <ConfirmDialog
          tone="warning"
          title="Submit Quiz?"
          body="Once submitted, you cannot change your answers. Unattempted questions will be marked as incomplete."
          confirmLabel="Submit Quiz"
          busy={isSubmitting}
          onCancel={() => setShowSubmitModal(false)}
          onConfirm={confirmSubmit}
        />
      )}
      {/* restart attention */}
      {showRestartModal && (
        <ConfirmDialog
          tone="danger"
          title="Restart Quiz?"
          body="All your progress for this technology/level will be lost. Timer will start fresh from the beginning."
          confirmLabel="Restart Quiz"
          onCancel={() => setShowRestartModal(false)}
          onConfirm={() => {
            setShowRestartModal(false);
            confirmRestart();
          }}
        />
      )}
      {/* start a new attempt while an unfinished one is saved */}
      {showStartNewModal && (
        <ConfirmDialog
          tone="danger"
          title="Start New Quiz?"
          body="Your unfinished attempt for this level will be replaced by a fresh one. The saved answers and remaining time of the current attempt will be discarded."
          confirmLabel="Start New Quiz"
          onCancel={() => setShowStartNewModal(false)}
          onConfirm={() => {
            setShowStartNewModal(false);
            handleStartQuiz();
          }}
        />
      )}
      {/* login required for start quiz */}
      {showLoginModal && (
        <ConfirmDialog
          tone="info"
          title="Login Required"
          body="Please login to start the quiz."
          confirmLabel="Login"
          onCancel={() => setShowLoginModal(false)}
          onConfirm={() => {
            setShowLoginModal(false);
            openSignIn();
          }}
        />
      )}
    </div>
  );
};

export default Sidebar;






