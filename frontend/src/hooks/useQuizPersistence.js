import { useEffect, useRef, useState } from "react";
import { countAnswered, isAllAnswered } from "../utils/quizProgress.js";
import {
  removeSavedProgress,
  saveProgressState,
} from "../utils/quizStorage.js";

// Owns the per-tech/per-level quiz progress state and every localStorage
// write/read for it. Sidebar orchestrates; the timer hook only calls back
// into the functions exposed here.
export function useQuizPersistence({
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
}) {
  const [progressByTech, setProgressByTech] = useState(
    savedState?.progressByTech || {},
  );

  // Timer values (timeLeft / isTimerRunning / calculateElapsedTime) live in
  // useQuizTimer, which is created after this hook, so saveTimerState reads
  // the latest values through this ref (same pattern as onSaveTimerStateRef).
  const timerApiRef = useRef({
    timeLeft: 0,
    isTimerRunning: false,
    calculateElapsedTime: () => 0,
  });

  const setTimerApi = (timerApi) => {
    timerApiRef.current = timerApi;
  };

  // Persist helper: update progressByTech for a specific tech/level and save to localStorage immediately
  const persistProgressForLevel = (tech, level, levelProgress) => {
    if (!tech || !level) return;
    const updatedProgress = {
      ...progressByTech,
      [tech]: {
        ...(progressByTech[tech] || {}),
        [level]: {
          ...(progressByTech[tech]?.[level] || {}),
          ...levelProgress,
        },
      },
    };
    setProgressByTech(updatedProgress);

    // Save to localStorage
    saveProgressState({
      currentTech: tech,
      currentLevel: level,
      progressByTech: updatedProgress,
    });
  };

  const saveTimerState = () => {
    if (selectedTech && selectedLevel) {
      const { timeLeft, isTimerRunning, calculateElapsedTime } =
        timerApiRef.current;
      const currentElapsed = calculateElapsedTime();
      // Persist per-level immediately (so other levels remain untouched)
      persistProgressForLevel(selectedTech, selectedLevel, {
        currentQuestion,
        userAnswers,
        showResults,
        completedQuestions: Array.from(completedQuestions),
        isSubmitted,
        reviewMode,
        timeLeft,
        timerStartedAt: isTimerRunning ? Date.now() : null,
        elapsedTime: currentElapsed,
        isQuizStarted,
      });
    }
  };

  // Persist to localStorage whenever relevant state changes (global progressByTech managed by persist helper)
  useEffect(() => {
    saveProgressState({
      currentTech: selectedTech,
      currentLevel: selectedLevel,
      progressByTech,
    });
  }, [selectedTech, selectedLevel, progressByTech]);

  // Answered-count progress shown next to each tech/level
  const getProgressForTechLevel = (techId, levelId) => {
    const progress = progressByTech?.[techId]?.[levelId];
    if (!progress || !progress.userAnswers) return { answered: 0, total: 0 };
    const questions = questionsData[techId]?.[levelId]?.questions || [];

    return {
      answered: countAnswered(progress.userAnswers),
      total: questions.length,
    };
  };

  const isTechLevelCompleted = (techId, levelId) => {
    const progress = progressByTech?.[techId]?.[levelId];
    if (!progress || !progress.userAnswers) return false;

    const questions = questionsData[techId]?.[levelId]?.questions || [];

    return isAllAnswered(progress.userAnswers, questions.length);
  };

  const clearSavedProgress = () => {
    removeSavedProgress();
  };

  return {
    progressByTech,
    setProgressByTech,
    persistProgressForLevel,
    saveTimerState,
    setTimerApi,
    getProgressForTechLevel,
    isTechLevelCompleted,
    clearSavedProgress,
  };
}
