import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Check,
  ClipboardCopy,
  Clock,
  Copy,
  Download,
  FileText,
  Hash,
  ShieldCheck,
} from 'lucide-react';
import { useApi } from '../services/api/api.js';
import { quizDetailStyles, levelBadgeTone } from '../assets/dummyStyles.jsx';

const formatDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const QuizPage = () => {
  const { id } = useParams();
  const { request } = useApi();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const fetchQuiz = async () => {
      try {
        setLoading(true);
        setError("");
        // Fetch quiz by id from backend
        const data = await request(`/admin/quiz/${id}`);
        if (!mounted) return;
        if (!data.quiz) throw new Error("Quiz not found");
        setQuiz(data.quiz);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "Failed to load quiz");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchQuiz();
    return () => {
      mounted = false;
    };
    // `attempt` drives manual retries; the request function from useApi is a
    // fresh identity every render and must not re-trigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const copyQuizId = async () => {
    try {
      await navigator.clipboard.writeText(String(quiz?._id || id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const downloadMetadata = () => {
    if (!quiz) return;
    try {
      const blob = new Blob([JSON.stringify(quiz, null, 2)], {
        type: "application/json;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `quiz-${quiz._id || id}-metadata.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Download is a convenience; a blocked download never breaks the page.
    }
  };

  // Cloning happens server-side (answer keys never reach the browser); the
  // new quiz detail is opened when the copy is ready.
  const duplicateQuiz = async () => {
    if (duplicating) return;
    setDuplicating(true);
    setActionMessage("");
    try {
      const data = await request(`/admin/quiz/${id}/duplicate`, "POST");
      if (data?.quiz?._id) {
        navigate(`/quiz/${data.quiz._id}`);
      } else {
        navigate("/list");
      }
    } catch (err) {
      setActionMessage(err?.message || "Duplicate failed. Please try again.");
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div className={quizDetailStyles.page}>
      <div className={quizDetailStyles.container}>
        <Link to="/list" className={quizDetailStyles.backLink}>
          <ArrowLeft className={quizDetailStyles.backIcon} aria-hidden="true" />
          Back to quizzes
        </Link>

        {loading && (
          <div
            className={quizDetailStyles.loadingWrap}
            role="status"
            aria-busy="true"
          >
            <span className="sr-only">Loading quiz…</span>
            <div className={quizDetailStyles.card}>
              <div
                className={`${quizDetailStyles.skeletonLine} h-4 w-24 mb-4`}
              />
              <div
                className={`${quizDetailStyles.skeletonLine} h-8 w-2/3 mb-6`}
              />
              <div className={quizDetailStyles.metaGrid}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className={quizDetailStyles.metaCard}>
                    <div
                      className={`${quizDetailStyles.skeletonLine} h-8 w-8 mb-3`}
                    />
                    <div
                      className={`${quizDetailStyles.skeletonLine} h-4 w-16 mb-2`}
                    />
                    <div
                      className={`${quizDetailStyles.skeletonLine} h-6 w-12`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className={quizDetailStyles.errorCard} role="alert">
            {/* h2, matching the list screen's error card: the detail page's
                only h1 is the quiz title in its ready state. */}
            <h2 className={quizDetailStyles.errorTitle}>
              Couldn&apos;t load this quiz
            </h2>
            <p className={quizDetailStyles.errorText}>{error}</p>
            <button
              type="button"
              className={quizDetailStyles.retryButton}
              onClick={retry}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && quiz && (
          <article className={quizDetailStyles.card}>
            <header className={quizDetailStyles.headerRow}>
              <div className={quizDetailStyles.titleWrap}>
                <div className={quizDetailStyles.eyebrow}>Quiz detail</div>
                <h1 className={quizDetailStyles.title}>
                  {quiz.technology || "Untitled quiz"}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={quizDetailStyles.statusPill}>
                  <span className={quizDetailStyles.statusDot} aria-hidden="true" />
                  Live in catalog
                </span>
                <span
                  className={`${quizDetailStyles.levelBadge} ${levelBadgeTone(quiz.level)}`}
                >
                  {quiz.level || "Unknown level"}
                </span>
              </div>
            </header>

            <div className={quizDetailStyles.metaGrid}>
              <div className={quizDetailStyles.metaCard}>
                <div className={quizDetailStyles.metaIconBox} aria-hidden="true">
                  <FileText className={quizDetailStyles.metaIcon} />
                </div>
                <div className={quizDetailStyles.metaLabel}>Questions</div>
                <div className={quizDetailStyles.metaValue}>
                  {quiz.totalQuestions ||
                    (quiz.questions ? quiz.questions.length : 0)}
                </div>
              </div>
              <div className={quizDetailStyles.metaCard}>
                <div className={quizDetailStyles.metaIconBox} aria-hidden="true">
                  <Clock className={quizDetailStyles.metaIcon} />
                </div>
                <div className={quizDetailStyles.metaLabel}>Time limit</div>
                <div className={quizDetailStyles.metaValue}>
                  {quiz.timeLimit != null ? `${quiz.timeLimit} min` : "—"}
                </div>
              </div>
              <div className={quizDetailStyles.metaCard}>
                <div className={quizDetailStyles.metaIconBox} aria-hidden="true">
                  <Calendar className={quizDetailStyles.metaIcon} />
                </div>
                <div className={quizDetailStyles.metaLabel}>Uploaded</div>
                <div
                  className={quizDetailStyles.metaValue}
                  title={quiz.createdAt || undefined}
                >
                  {formatDate(quiz.createdAt)}
                </div>
              </div>
            </div>

            <div className={quizDetailStyles.idRow}>
              <Hash className={quizDetailStyles.idCopyIcon} aria-hidden="true" />
              <span className={quizDetailStyles.idLabel}>ID</span>
              <span className={quizDetailStyles.idValue} title={quiz._id}>
                {quiz._id}
              </span>
              <button
                type="button"
                className={quizDetailStyles.idCopy}
                onClick={copyQuizId}
              >
                {copied ? (
                  <>
                    <Check className={quizDetailStyles.copiedIcon} aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <ClipboardCopy className={quizDetailStyles.idCopyIcon} aria-hidden="true" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className={quizDetailStyles.noticeCard}>
              <ShieldCheck className={quizDetailStyles.noticeIcon} aria-hidden="true" />
              <p className={quizDetailStyles.noticeText}>
                This quiz is live in the learner catalog. Question text is
                public; answer keys stay on the server and are never sent to any
                client.
              </p>
            </div>

            <div className={quizDetailStyles.actions}>
              <Link to="/list" className={quizDetailStyles.listButton}>
                Back to quizzes
              </Link>
              <button
                type="button"
                className={quizDetailStyles.secondaryButton}
                onClick={downloadMetadata}
              >
                <Download className={quizDetailStyles.secondaryIcon} aria-hidden="true" />
                Download metadata
              </button>
              <button
                type="button"
                className={quizDetailStyles.secondaryButton}
                onClick={duplicateQuiz}
                disabled={duplicating}
              >
                <Copy className={quizDetailStyles.secondaryIcon} aria-hidden="true" />
                {duplicating ? "Duplicating…" : "Duplicate quiz"}
              </button>
            </div>
            {actionMessage && (
              <p className={quizDetailStyles.errorText} role="alert">
                {actionMessage}
              </p>
            )}
          </article>
        )}
      </div>
    </div>
  );
};

export default QuizPage;
