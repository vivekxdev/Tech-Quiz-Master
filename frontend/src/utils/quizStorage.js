// Pure localStorage helpers for quiz progress persistence.
//
// The storage key and the persisted schema are unchanged from the original
// Sidebar implementation so already-saved user progress keeps working.

export const STORAGE_KEY = "techQuizMasterProgress";

// Default (empty) progress for a single tech + level slot.
// `attemptId` is the submission idempotency key of the attempt this record
// describes: null until an attempt starts, then a UUID that survives refreshes
// and retries so the server can collapse duplicate submissions (see
// utils/quizAttempt.js). Records written before the field existed simply have
// no attemptId and pick one up when they are started or resumed.
export const createDefaultLevelProgress = () => ({
  currentQuestion: 0,
  userAnswers: {},
  showResults: false,
  completedQuestions: [],
  isSubmitted: false,
  reviewMode: false,
  timeLeft: 0,
  timerStartedAt: null,
  elapsedTime: 0,
  isQuizStarted: false,
  attemptId: null,
});

// Defensive JSON parsing: malformed storage data must never crash startup.
export const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Error loading saved state:", error);
    return null;
  }
};

// Migrate old flat structure to new structure if needed
export const migrateLegacyProgress = (parsed) => {
  if (parsed && !parsed.progressByTech) {
    if (parsed.selectedTech && parsed.selectedLevel) {
      const migrated = {
        progressByTech: {
          [parsed.selectedTech]: {
            [parsed.selectedLevel]: {
              currentQuestion: parsed.currentQuestion || 0,
              userAnswers: parsed.userAnswers || {},
              showResults: parsed.showResults || false,
              completedQuestions: parsed.completedQuestions || [],
              isSubmitted: parsed.isSubmitted || false,
              reviewMode: parsed.reviewMode || false,
              timeLeft: parsed.timeLeft || 0,
              timerStartedAt: parsed.timerStartedAt || null,
              elapsedTime: parsed.elapsedTime || 0,
              isQuizStarted: parsed.isQuizStarted || false,
            },
          },
        },
        currentTech: parsed.selectedTech,
        currentLevel: parsed.selectedLevel,
        timestamp: new Date().toISOString(),
      };
      return migrated;
    }
  }
  return parsed;
};

// Load saved state from localStorage (with migration support)
export const loadSavedState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = safeParseJson(saved);
      return migrateLegacyProgress(parsed);
    }
  } catch (error) {
    console.error("Error loading saved state:", error);
  }
  return null;
};

// Saved progress for a specific tech + level, falling back to defaults.
export const getInitialProgressForTechLevel = (savedState, tech, level) => {
  if (!tech || !level) return createDefaultLevelProgress();

  return (
    savedState?.progressByTech?.[tech]?.[level] || createDefaultLevelProgress()
  );
};

// Shape written to localStorage (field order matches the original writer).
export const serializeProgressState = ({
  currentTech,
  currentLevel,
  progressByTech,
}) => ({
  currentTech,
  currentLevel,
  progressByTech,
  timestamp: new Date().toISOString(),
});

export const saveProgressState = ({
  currentTech,
  currentLevel,
  progressByTech,
}) => {
  try {
    const stateToSave = serializeProgressState({
      currentTech,
      currentLevel,
      progressByTech,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  } catch (err) {
    console.error("Failed saving state:", err);
  }
};

export const removeSavedProgress = () => {
  localStorage.removeItem(STORAGE_KEY);
};
