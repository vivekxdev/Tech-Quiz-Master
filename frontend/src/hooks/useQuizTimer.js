import { useEffect, useRef, useState } from "react";
import {
  hasSavedTimerAttempt,
  resolveRemainingTime,
} from "../utils/quizAttempt.js";

export function useQuizTimer({
  selectedTech,
  selectedLevel,
  questionsData,
  isQuizStarted,
  isSubmitted,
  reviewMode,
  showResults,
  progressByTech,
  initialTimeLeft = 0,
  initialTimerStartedAt = null,
  initialElapsedTime = 0,
  onTimeUp,
  onSaveTimerState,
  onPersistLevel,
}) {
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState(initialTimerStartedAt);
  const [elapsedTime, setElapsedTime] = useState(initialElapsedTime);
  const timerRef = useRef(null);

  const getTimeLimit = (tech, level) => {
    if (!tech || !level) return 0;

    const time = questionsData?.[tech]?.[level]?.timeLimit;

    return time ? time * 60 : 0;
  };

  // Readiness gate: timer resume/auto-submit must wait until the fetched quiz
  // catalog has the questions for the selected tech + level, otherwise
  // getTimeLimit() returns 0 and time can be misread as already expired.
  const isQuizDataReady = Boolean(
    selectedTech &&
      selectedLevel &&
      Array.isArray(questionsData[selectedTech]?.[selectedLevel]?.questions) &&
      questionsData[selectedTech][selectedLevel].questions.length > 0,
  );

  const calculateElapsedTime = () => {
    if (!timerStartedAt) return elapsedTime;
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - timerStartedAt) / 1000);
    return elapsedTime + elapsedSeconds;
  };

  const startTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    if (isSubmitted || reviewMode) return;

    setIsTimerRunning(true);

    const startTime = Date.now();
    setTimerStartedAt(startTime);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsTimerRunning(false);
    onSaveTimerState?.();
  };

  const resetTimer = () => {
    stopTimer();
    if (selectedLevel && !isSubmitted && !reviewMode && !showResults) {
      const fullTime = getTimeLimit(selectedTech, selectedLevel);
      setTimeLeft(fullTime);
      setTimerStartedAt(null);
      setElapsedTime(0);

      // Update progress immediately
      if (selectedTech && selectedLevel) {
        onPersistLevel?.(selectedTech, selectedLevel, {
          ...(progressByTech?.[selectedTech]?.[selectedLevel] || {}),
          timeLeft: fullTime,
          timerStartedAt: null,
          elapsedTime: 0,
        });
      }
    }
  };

  // Auto-submit when timeLeft reaches 0 (single authoritative effect)
  // Waits for the quiz catalog so handleTimeUp is never triggered while the
  // questions/time limit for this tech+level are still unknown.
  useEffect(() => {
    if (!isQuizDataReady) return;
    if (timeLeft === 0 && isQuizStarted && !isSubmitted && !reviewMode) {
      onTimeUp?.();
    }
  }, [timeLeft, isQuizStarted, isSubmitted, reviewMode, isQuizDataReady]);

  // Initialize timer when level is selected or on refresh - ONLY if quiz was already started
  useEffect(() => {
    if (
      selectedLevel &&
      selectedTech &&
      // Wait for the quiz catalog for this tech+level; otherwise getTimeLimit()
      // returns 0, the remaining time reads as expired and auto-submit could
      // fire before any question data exists.
      isQuizDataReady &&
      !showResults &&
      !isSubmitted &&
      !reviewMode &&
      isQuizStarted
    ) {
      // Get saved progress for this tech/level
      const savedProgress = progressByTech?.[selectedTech]?.[selectedLevel];
      const timeLimit = getTimeLimit(selectedTech, selectedLevel);

      if (savedProgress && hasSavedTimerAttempt(savedProgress)) {
        // Restore a paused attempt. Wall-clock elapsed time is authoritative
        // over the stored countdown, and records missing a timerStartedAt
        // segment (stopped before the catalog/timer could run) are restored
        // instead of being silently reset to a full time limit.
        const currentElapsed = Math.max(
          Number(savedProgress.elapsedTime) || 0,
          0,
        );
        const remainingTime = resolveRemainingTime({
          timeLimit,
          elapsedTime: savedProgress.elapsedTime,
          timeLeft: savedProgress.timeLeft,
        });

        setTimeLeft(remainingTime);
        setElapsedTime(currentElapsed);

        if (remainingTime > 0) {
          // Resume timer from where it left off
          setTimerStartedAt(Date.now() - currentElapsed * 1000);
          startTimer();
        } else {
          // Time's up
          onTimeUp?.();
        }
      } else {
        // No restorable attempt for this level: start a fresh timer
        setTimeLeft(timeLimit);
        setTimerStartedAt(Date.now());
        setElapsedTime(0);
        startTimer();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLevel, selectedTech, isQuizStarted, isQuizDataReady]);

  // The unmount cleanup below must run on unmount ONLY, so these two values
  // are mirrored into refs instead of being effect dependencies. The previous
  // version was keyed on [isTimerRunning]: the false -> true transition ran
  // that cleanup and cleared the interval startTimer() had just created,
  // leaving the countdown frozen at its initial value.
  const isTimerRunningRef = useRef(isTimerRunning);
  const onSaveTimerStateRef = useRef(onSaveTimerState);
  useEffect(() => {
    isTimerRunningRef.current = isTimerRunning;
    onSaveTimerStateRef.current = onSaveTimerState;
  });

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (isTimerRunningRef.current) {
        onSaveTimerStateRef.current?.();
      }
    };
  }, []);

  // Save timer state when component loses focus (user navigates away)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isTimerRunning) {
        onSaveTimerState?.();
      }
    };

    const handleBeforeUnload = () => {
      if (isTimerRunning) {
        onSaveTimerState?.();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [
    isTimerRunning,
    selectedTech,
    selectedLevel,
    timeLeft,
    timerStartedAt,
    elapsedTime,
  ]);

  return {
    timeLeft,
    isTimerRunning,
    timerStartedAt,
    elapsedTime,
    setTimeLeft,
    setTimerStartedAt,
    setElapsedTime,
    startTimer,
    stopTimer,
    resetTimer,
    calculateElapsedTime,
    getTimeLimit,
  };
}
