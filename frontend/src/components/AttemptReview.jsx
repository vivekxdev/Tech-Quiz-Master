import React, { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import Button from "./ui/Button.jsx";
import { extractReviewEntries } from "../utils/quizResults.js";
import {
  getBadgeClasses,
  getBadgeText,
  reviewStyles,
} from "../assets/dummyStyles (1).js";

// Safe completion label: prefers startDate (when the attempt ran) and falls
// back to createdAt; anything unparseable reads "date unavailable" instead of
// rendering Invalid Date / undefined.
const toSafeLabel = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Modal that reopens the per-question review of an ALREADY recorded attempt.
//
// Ownership/authorization: this component only ever renders a row the user
// fetched from their own GET /results/my-results (server-scoped by the Clerk
// session), and the data comes from that result's stored snapshot — the same
// review contract the live results screen shows. The Quiz's answerKey field is
// never part of a Result document, so nothing here can leak it.
//
// Legacy records (client-scored, no snapshot) show an explanatory message
// instead of an empty review.
const AttemptReview = ({ result, onClose }) => {
  const entries = extractReviewEntries(result);
  const panelRef = useRef(null);
  const titleId = "attempt-review-title";
  const percent =
    result.totalQuestions > 0
      ? Math.round((result.correct / result.totalQuestions) * 100)
      : 0;
  const completedLabel =
    toSafeLabel(result.startDate) ||
    toSafeLabel(result.createdAt) ||
    "date unavailable";

  // Escape dismisses; focus lands inside the dialog so keyboard users start
  // in the right place, and Tab is trapped between first and last focusable.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector("button")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className={reviewStyles.overlay}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = panelRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div
        className={reviewStyles.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={reviewStyles.panel}
      >
        <header className={reviewStyles.header}>
          <div className={reviewStyles.headerText}>
            <h2 id={titleId} className={reviewStyles.title}>
              Review — {result.title}
            </h2>
            <p className={reviewStyles.subtitle}>
              Completed attempt · {completedLabel}
            </p>
          </div>
          <div className={reviewStyles.headerStats}>
            <span className={getBadgeClasses(percent)}>{getBadgeText(percent)}</span>
            <span className={reviewStyles.score}>
              {result.correct}/{result.totalQuestions} · {percent}%
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close review"
              className={reviewStyles.close}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={reviewStyles.body}>
          {entries === null ? (
            <p role="status" className={reviewStyles.legacy}>
              Review isn&apos;t available for this attempt — it was saved before
              per-question answers were stored. The score, totals and date above
              are still accurate.
            </p>
          ) : (
            <ol className={reviewStyles.list}>
              {entries.map((entry, index) => {
                const answered = entry.selectedAnswer !== -1;
                const isCorrect =
                  answered && entry.selectedAnswer === entry.correctAnswer;
                return (
                  <li
                    key={`${result._id || result.title}-q${index}`}
                    className={reviewStyles.question}
                  >
                    <div className={reviewStyles.questionTop}>
                      <p className={reviewStyles.questionText}>
                        {index + 1}. {entry.question}
                      </p>
                      <span
                        className={`${reviewStyles.chip} ${
                          !answered
                            ? reviewStyles.chipUnanswered
                            : isCorrect
                              ? reviewStyles.chipCorrect
                              : reviewStyles.chipIncorrect
                        }`}
                      >
                        {!answered
                          ? "Unanswered"
                          : isCorrect
                            ? "Correct"
                            : "Incorrect"}
                      </span>
                    </div>
                    <ul className={reviewStyles.options}>
                      {entry.options.map((option, optionIndex) => {
                        const picked = entry.selectedAnswer === optionIndex;
                        const answer = entry.correctAnswer === optionIndex;
                        return (
                          <li
                            key={`${result._id || result.title}-q${index}-o${optionIndex}`}
                            className={`${reviewStyles.option} ${
                              answer
                                ? reviewStyles.optionCorrect
                                : picked
                                  ? reviewStyles.optionPicked
                                  : reviewStyles.optionIdle
                            }`}
                          >
                            <span className={reviewStyles.optionText}>{option}</span>
                            {(picked || answer) && (
                              <span className={reviewStyles.optionLabel}>
                                {answer ? (
                                  <Check size={11} aria-hidden="true" />
                                ) : (
                                  <X size={11} aria-hidden="true" />
                                )}
                                {picked && answer
                                  ? "Your answer · Correct"
                                  : picked
                                    ? "Your answer"
                                    : "Correct answer"}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <footer className={reviewStyles.footer}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </footer>
      </div>
    </div>
  );
};

export default AttemptReview;
