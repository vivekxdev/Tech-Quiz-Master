import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../services/api/api.js';
import { dashboardStyles, getLevelTone, levelBadgeTone } from '../assets/dummyStyles.jsx';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Layers,
  Lightbulb,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  UploadCloud,
  UserCheck,
  Users,
  X,
} from 'lucide-react';

// Difficulty options; the selected state's colours come from the shared
// level-tone map in the style registry (one palette for every admin screen).
const LEVEL_VALUES = ["Basic", "Intermediate", "Advanced"];

const LEVEL_BLURBS = {
  Basic: "Warm-up level",
  Intermediate: "Working knowledge",
  Advanced: "Deep expertise",
};

const letterForIndex = (i) => ["A", "B", "C", "D"][i] || "";

const CSV_TEMPLATE =
  "Question,Option A,Option B,Option C,Option D,Answer\n" +
  "What is 2 plus 2?,One,Two,Three,Four,One\n";

// CSV parsing function
function parseCSVText(csvText) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (current !== "" || row.length > 0) {
        row.push(current);
        rows.push(row);
      }
      current = "";
      row = [];
      if (char === "\r" && csvText[i + 1] === "\n") i++;
      continue;
    }

    current += char;
  }

  if (current !== "" || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows.map((r) => r.map((c) => c.trim()));
}

const Dashboard = () => {

  const [technology, setTechnology] = useState("");
  const [level, setLevel] = useState("Basic");
  const [timeLimit, setTimeLimit] = useState(30); // in minutes
  const [questions, setQuestions] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState({
    show: false,
    type: "success",
    message: "",
  });
  const [showPreview, setShowPreview] = useState(false);  // preview for uploaded questions
  const [previewQuery, setPreviewQuery] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const fileInputRef = useRef(null);

  // Real platform stats from GET /admin/stats (admin-only on the server).
  // status: loading | ready | error — never fabricated numbers.
  const [stats, setStats] = useState(null);
  const [statsStatus, setStatsStatus] = useState("loading");
  const [statsAttempt, setStatsAttempt] = useState(0);
  const { request } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const loadStats = async () => {
      setStatsStatus("loading");
      try {
        const data = await request("/admin/stats");
        if (!mounted) return;
        setStats({
          totalUsers: data.totalUsers ?? null,
          totalLoggedIn: data.loggedInUsers ?? null,
          loggedInPercentage: data.loggedInPercentage ?? null,
          totalQuizzes: data.totalQuizzes ?? null,
          totalQuestions: data.totalQuestions ?? null,
          levelCounts: data.levelCounts ?? null,
          recentQuizzes: Array.isArray(data.recentQuizzes) ? data.recentQuizzes : [],
        });
        setStatsStatus("ready");
      } catch {
        if (!mounted) return;
        setStats(null);
        setStatsStatus("error");
      }
    };

    loadStats();
    return () => {
      mounted = false;
    };
    // Re-runs when the user asks for a retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsAttempt]);

  // Losing the CSV-loaded questions to an accidental navigation would cost the
  // admin real work, so the browser asks for confirmation while any are loaded.
  // resetForm() clears the flag before the post-success redirect, so the happy
  // path never prompts.
  const hasQuestionsRef = useRef(false);
  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (hasQuestionsRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

//   Toast timer
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast((prev) => ({ ...prev, show: false }));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const showToast = (type, message) => setToast({ show: true, type, message });

//   Form validation
  const validateForm = () => {
    const errors = {};

    if (!technology.trim()) {
      errors.technology = "Technology name is required";
    }

    if (!level) {
      errors.level = "Level is required";
    }

    if (!timeLimit || timeLimit < 1) {
      errors.timeLimit = "Time limit must be at least 1 minute";
    }

    if (questions.length === 0) {
      errors.questions = "Please upload CSV with questions";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  }; // to drag and drop the csv file

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    // Browsers are inconsistent about CSV MIME types (`text/csv`,
    // `application/vnd.ms-excel` or empty for unknown files), so the file
    // extension is the reliable signal.
    const isCsv =
      file &&
      (file.type === "text/csv" ||
        file.type === "application/vnd.ms-excel" ||
        file.type === "" ||
        String(file.name).toLowerCase().endsWith(".csv"));
    if (isCsv) {
      processCSVFile(file);
    } else {
      showToast("error", "Please upload a valid CSV file");
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      processCSVFile(file);
    }
  }; // to upload the csv file using file input

  const processCSVFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      processCSVText(text);
    };
    reader.readAsText(file);
  }; // to render the csv file

  const processCSVText = (csvText) => {
    if (!csvText) return;

    const rows = parseCSVText(csvText);
    if (rows.length === 0) {
      showToast("error", "Uploaded CSV is empty or invalid");
      return;
    }

    const header = rows[0].map((c) => c.toLowerCase());
    let startIdx = 0;

    const hasQuestionHeader = header.some(
      (h) => h.includes("question") || h.includes("q."),
    );
    const hasAnswerHeader = header.some(
      (h) => h.includes("answer") || h.includes("correct"),
    );
    const hasOptionsHeader = header.some(
      (h) => h.includes("option") || h.includes("choice"),
    );

    if (hasQuestionHeader && (hasAnswerHeader || hasOptionsHeader)) {
      startIdx = 1;
    }

    const parsedQuestions = [];
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];

      if (row.length === 0 || row.every((cell) => !cell.trim())) {
        continue;
      }

      const paddedRow = [...row];
      while (paddedRow.length < 6) {
        paddedRow.push("");
      }

      const question = paddedRow[0] || "";
      const options = [
        paddedRow[1] || "",
        paddedRow[2] || "",
        paddedRow[3] || "",
        paddedRow[4] || "",
      ];
      const answerRaw = (paddedRow[5] || "").trim().toUpperCase();

      let answerKey = "";
      let answerText = "";

      let foundAnswer = false;

      if (["A", "B", "C", "D"].includes(answerRaw)) {
        answerKey = answerRaw;
        const idx = ["A", "B", "C", "D"].indexOf(answerRaw);
        answerText = options[idx] || answerRaw;
        foundAnswer = true;
      }

      if (!foundAnswer && ["1", "2", "3", "4"].includes(answerRaw)) {
        const idx = parseInt(answerRaw) - 1;
        answerKey = ["A", "B", "C", "D"][idx];
        answerText = options[idx] || answerRaw;
        foundAnswer = true;
      }

      if (!foundAnswer) {
        for (let j = 0; j < options.length; j++) {
          if (options[j].trim().toLowerCase() === answerRaw.toLowerCase()) {
            answerKey = ["A", "B", "C", "D"][j];
            answerText = options[j];
            foundAnswer = true;
            break;
          }
        }
      }

      if (!foundAnswer) {
        for (let j = 0; j < options.length; j++) {
          if (
            options[j].trim().toLowerCase().includes(answerRaw.toLowerCase()) ||
            answerRaw.toLowerCase().includes(options[j].trim().toLowerCase())
          ) {
            answerKey = ["A", "B", "C", "D"][j];
            answerText = options[j];
            foundAnswer = true;
            break;
          }
        }
      }

      if (!foundAnswer && options[0]) {
        answerKey = "A";
        answerText = options[0];
      }

      if (question.trim()) {
        parsedQuestions.push({
          question: question.trim(),
          options: options.map((opt) => opt.trim()),
          answerKey,
          answerText,
        });
      }
    }

    if (parsedQuestions.length === 0) {
      showToast("error", "No valid questions found in CSV");
      return;
    }

    setQuestions(parsedQuestions);
    hasQuestionsRef.current = true;
    setShowPreview(true);
    setPreviewQuery("");
    setValidationErrors((prev) => ({ ...prev, questions: "" }));

    showToast("success", `${parsedQuestions.length} questions loaded successfully`);
  }; // This function will open the CSV file and
  // show the ques, ans options

  const handleSubmit = async () => {
    if (!validateForm()) {
      showToast("error", "Please fill all required fields");
      return;
    }

    try {
      const payload = {
        technology: technology.trim(),
        level,
        timeLimit: parseInt(timeLimit),
        questions,
        totalQuestions: questions.length,
      };

      await request(
        "/admin/upload-quiz",
        "POST",
        payload,
      );

      showToast("success", `Quiz "${technology}" created successfully`);

      resetForm();
      // In-app navigation (no full reload): the catalogue shows the new quiz
      // and the admin keeps their session exactly where it was.
      navigate("/list");
    } catch (err) {
      console.log("UPLOAD ERROR:", err);

      showToast("error", err.message || "Quiz upload failed");
    }
  };

  // back to the initial state after successful upload
  const resetForm = () => {
    hasQuestionsRef.current = false;
    setTechnology("");
    setLevel("Basic");
    setTimeLimit(30);
    setQuestions([]);
    setShowPreview(false);
    setPreviewQuery("");
    setValidationErrors({});
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClearForm = () => {
    resetForm();
    showToast("info", "Form cleared");
  };

  const removeQuestion = (index) => {
    setQuestions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setShowPreview(false);
      }
      return next;
    });
  };

  const downloadCsvTemplate = () => {
    try {
      const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tech-quiz-template.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("success", "CSV template downloaded");
    } catch {
      showToast("error", "Could not download the template");
    }
  };

  const formComplete =
    Boolean(technology.trim()) && Boolean(level) && timeLimit >= 1 && questions.length > 0;

  const visiblePreview = questions
    .map((q, index) => ({ q, index }))
    .filter(({ q }) =>
      q.question.toLowerCase().includes(previewQuery.trim().toLowerCase()),
    );

  const loggedInRate = Number(stats?.loggedInPercentage);
  const progressWidth = Number.isFinite(loggedInRate)
    ? Math.max(0, Math.min(100, loggedInRate))
    : 0;

  return (
    <div className={dashboardStyles.page}>
      <div className={dashboardStyles.container}>
        <header className={dashboardStyles.headerWrapper}>
          <div className={dashboardStyles.headerRow}>
            <div>
              <span className={dashboardStyles.headerEyebrow}>
                <span className={dashboardStyles.headerEyebrowDot} aria-hidden="true" />
                Admin workspace
              </span>
              <h1 className={dashboardStyles.title}>Dashboard</h1>
              <p className={dashboardStyles.subtitle}>
                Create a new quiz and review the platform&apos;s real numbers.
              </p>
            </div>
            <div className={dashboardStyles.headerActions}>
              <button
                type="button"
                onClick={() => navigate("/list")}
                className={dashboardStyles.headerPrimaryLink}
              >
                <Layers className={dashboardStyles.headerPrimaryIcon} aria-hidden="true" />
                Manage quizzes
              </button>
              <button
                type="button"
                onClick={downloadCsvTemplate}
                className={dashboardStyles.headerLink}
              >
                <Download className={dashboardStyles.headerLinkIcon} aria-hidden="true" />
                CSV template
              </button>
            </div>
          </div>
        </header>

        {/* Platform stats — only real GET /admin/stats values, with honest states */}
        <section
          aria-label="Platform statistics"
          className={dashboardStyles.statsCard}
        >
          <div className={dashboardStyles.statsHeader}>
            <div className={dashboardStyles.statsHeaderLeft}>
              <div className={dashboardStyles.statsIconBox} aria-hidden="true">
                <BarChart3 className={dashboardStyles.statsIcon} />
              </div>
              <div>
                <h2 className={dashboardStyles.statsTitle}>Platform stats</h2>
                <p className={dashboardStyles.statsSubtitle}>
                  Live values served by the access-controlled stats endpoint
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Refresh stats"
              className={dashboardStyles.statsRetry}
              onClick={() => setStatsAttempt((n) => n + 1)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {statsStatus === "loading" && (
            <div className={dashboardStyles.statsGrid}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={dashboardStyles.statCard}>
                  <div className={dashboardStyles.statSkeleton} />
                </div>
              ))}
            </div>
          )}
          {statsStatus === "error" && (
            <div
              className={dashboardStyles.statsErrorRow}
              role="status"
            >
              <span>Stats are unavailable right now.</span>
              <button
                type="button"
                className={dashboardStyles.statsRetry}
                onClick={() => setStatsAttempt((n) => n + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {statsStatus === "ready" && stats && (
            <>
              <div className={dashboardStyles.statsGrid}>
                <div className={dashboardStyles.statCard}>
                  <div className={dashboardStyles.statCardContent}>
                    <div className={dashboardStyles.statIconBox}>
                      <Users
                        className={`${dashboardStyles.statIcon} ${dashboardStyles.statIconIndigo}`}
                        aria-hidden="true"
                      />
                    </div>
                    <div className={dashboardStyles.statTextWrap}>
                      <div className={dashboardStyles.statLabel}>
                        Registered users
                      </div>
                      <div className={dashboardStyles.statValue}>
                        {stats.totalUsers ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={dashboardStyles.statCard}>
                  <div className={dashboardStyles.statCardContent}>
                    <div className={dashboardStyles.statIconBox}>
                      <UserCheck
                        className={`${dashboardStyles.statIcon} ${dashboardStyles.statIconEmerald}`}
                        aria-hidden="true"
                      />
                    </div>
                    <div className={dashboardStyles.statTextWrap}>
                      <div className={dashboardStyles.statLabel}>
                        Logged in
                      </div>
                      <div className={dashboardStyles.statValue}>
                        {stats.totalLoggedIn ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={dashboardStyles.statCard}>
                  <div className={dashboardStyles.statCardContent}>
                    <div className={dashboardStyles.statIconBox}>
                      <TrendingUp
                        className={`${dashboardStyles.statIcon} ${dashboardStyles.statIconViolet}`}
                        aria-hidden="true"
                      />
                    </div>
                    <div className={dashboardStyles.statTextWrap}>
                      <div className={dashboardStyles.statLabel}>
                        Login rate
                      </div>
                      <div className={dashboardStyles.statValue}>
                        {stats.loggedInPercentage != null
                          ? `${stats.loggedInPercentage}%`
                          : "—"}
                      </div>
                      <div
                        className={dashboardStyles.loginProgressTrack}
                        aria-hidden="true"
                      >
                        <div
                          className={dashboardStyles.loginProgressFill}
                          style={{ width: `${progressWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className={dashboardStyles.statCard}>
                  <div className={dashboardStyles.statCardContent}>
                    <div className={dashboardStyles.statIconBox}>
                      <Layers
                        className={`${dashboardStyles.statIcon} ${dashboardStyles.statIconAmber}`}
                        aria-hidden="true"
                      />
                    </div>
                    <div className={dashboardStyles.statTextWrap}>
                      <div className={dashboardStyles.statLabel}>
                        Quizzes in catalog
                      </div>
                      <div className={dashboardStyles.statValue}>
                        {stats.totalQuizzes ?? "—"}
                      </div>
                      {typeof stats.totalQuestions === "number" && (
                        <div className={dashboardStyles.statMeta}>
                          {stats.totalQuestions} questions
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {stats.levelCounts && (
                <div className={dashboardStyles.levelSplit}>
                  {LEVEL_VALUES.map((lvl) => {
                    const tone = getLevelTone(lvl);
                    return (
                      <span key={lvl} className={dashboardStyles.levelSplitItem}>
                        <span
                          className={`h-2 w-2 rounded-full ${tone.dot}`}
                          aria-hidden="true"
                        />
                        {lvl}: {stats.levelCounts[lvl] ?? 0}
                      </span>
                    );
                  })}
                </div>
              )}

              {stats.recentQuizzes.length > 0 && (
                <div className={dashboardStyles.recentCard}>
                  <div className={dashboardStyles.recentHeader}>
                    <h3 className={dashboardStyles.recentTitle}>
                      Recent uploads
                    </h3>
                    <span className={dashboardStyles.recentHint}>
                      Latest {stats.recentQuizzes.length}
                    </span>
                  </div>
                  <ul className={dashboardStyles.recentList}>
                    {stats.recentQuizzes.map((quiz) => (
                      <li key={quiz._id} className={dashboardStyles.recentItem}>
                        <div className={dashboardStyles.recentItemLeft}>
                          <span
                            className={dashboardStyles.recentAvatar}
                            aria-hidden="true"
                          >
                            <FileSpreadsheet
                              className={dashboardStyles.recentAvatarIcon}
                            />
                          </span>
                          <div className="min-w-0">
                            <div className={dashboardStyles.recentName}>
                              {quiz.technology}
                            </div>
                            <div className={dashboardStyles.recentMeta}>
                              {quiz.totalQuestions ?? 0} questions ·{" "}
                              {quiz.timeLimit != null
                                ? `${quiz.timeLimit} min`
                                : "no time limit"}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`${dashboardStyles.recentBadge} ${levelBadgeTone(quiz.level)}`}
                        >
                          {quiz.level}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        <div className={dashboardStyles.grid}>
          {/* Main Column */}
          <div className={dashboardStyles.mainColumn}>
            <div className={dashboardStyles.card}>
              <div className={dashboardStyles.sectionHeader}>
                <span className={dashboardStyles.sectionStep} aria-hidden="true">
                  1
                </span>
                <div>
                  <h2 className={dashboardStyles.cardTitle}>Create New Quiz</h2>
                  <p className={dashboardStyles.cardHint}>
                    Name the quiz, pick a level and load the question bank.
                  </p>
                </div>
              </div>
              <div className={dashboardStyles.formFields}>
                {/* Technology Input */}
                <div>
                  <label
                    htmlFor="quiz-technology"
                    className={dashboardStyles.label}
                  >
                    Technology Name{" "}
                    <span
                      className={dashboardStyles.requiredMark}
                      aria-hidden="true"
                    >
                      *
                    </span>
                  </label>
                  <input
                    id="quiz-technology"
                    type="text"
                    value={technology}
                    autoComplete="off"
                    aria-invalid={Boolean(validationErrors.technology)}
                    aria-describedby={
                      validationErrors.technology
                        ? "quiz-technology-error"
                        : undefined
                    }
                    onChange={(e) => {
                      setTechnology(e.target.value);
                      setValidationErrors((prev) => ({ ...prev, technology: "" }));
                    }}
                    placeholder="e.g:- JavaScript, React, Python"
                    className={`${dashboardStyles.inputBase} ${
                      validationErrors.technology
                        ? dashboardStyles.inputErrorBorder
                        : dashboardStyles.inputNormalBorder
                    }`}
                  />
                  {validationErrors.technology && (
                    <p
                      id="quiz-technology-error"
                      className={dashboardStyles.errorMessage}
                      role="alert"
                    >
                      <AlertCircle
                        className={dashboardStyles.errorIcon}
                        aria-hidden="true"
                      />
                      {validationErrors.technology}
                    </p>
                  )}
                </div>

                {/* Level Selection */}
                <div>
                  {/* Visible caption; the button group below carries its own
                      aria-label, and a <label for> may only target form
                      controls — a div is not a labelable element. */}
                  <span className={dashboardStyles.label}>
                    Level{" "}
                    <span
                      className={dashboardStyles.requiredMark}
                      aria-hidden="true"
                    >
                      *
                    </span>
                  </span>
                  <div
                    role="group"
                    aria-label="Level"
                    className={dashboardStyles.levelGrid}
                  >
                    {LEVEL_VALUES.map((lvl) => {
                      const tone = getLevelTone(lvl);
                      return (
                        <button
                          key={lvl}
                          type="button"
                          aria-pressed={level === lvl}
                          className={`${dashboardStyles.levelButtonBase} ${
                            level === lvl
                              ? `${tone.bg} ${tone.text} border-2 border-current`
                              : dashboardStyles.levelButtonIdle
                          }`}
                          onClick={() => {
                            setLevel(lvl);
                            setValidationErrors((prev) => ({ ...prev, level: "" }));
                          }}
                        >
                          <span className={dashboardStyles.levelButtonTextBase}>
                            {lvl}
                          </span>
                          <span className={dashboardStyles.levelButtonCaption}>
                            {LEVEL_BLURBS[lvl]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {validationErrors.level && (
                    <p
                      id="quiz-level-error"
                      className={dashboardStyles.errorMessage}
                      role="alert"
                    >
                      <AlertCircle
                        className={dashboardStyles.errorIcon}
                        aria-hidden="true"
                      />
                      {validationErrors.level}
                    </p>
                  )}
                </div>

                {/* Time Limit */}
                <div>
                  <label
                    htmlFor="quiz-time-limit"
                    className={dashboardStyles.label}
                  >
                    Time Limit (minutes){" "}
                    <span
                      className={dashboardStyles.requiredMark}
                      aria-hidden="true"
                    >
                      *
                    </span>
                  </label>
                  <div className={dashboardStyles.timeContainer}>
                    <div className={dashboardStyles.timeInputWrapper}>
                      <input
                        id="quiz-time-limit"
                        type="number"
                        min={1}
                        value={timeLimit}
                        aria-invalid={Boolean(validationErrors.timeLimit)}
                        aria-describedby={
                          validationErrors.timeLimit
                            ? "quiz-time-limit-error"
                            : undefined
                        }
                        onChange={(e) => {
                          setTimeLimit(Number(e.target.value));
                          setValidationErrors((prev) => ({ ...prev, timeLimit: "" }));
                        }}
                        className={`${dashboardStyles.timeInputBase} ${
                          validationErrors.timeLimit
                            ? dashboardStyles.inputErrorBorder
                            : dashboardStyles.inputNormalBorder
                        }`}
                      />
                    </div>
                    <span className={dashboardStyles.timeDisplay}>
                      {timeLimit} min
                    </span>
                  </div>
                  {validationErrors.timeLimit && (
                    <p
                      id="quiz-time-limit-error"
                      className={dashboardStyles.errorMessage}
                      role="alert"
                    >
                      <AlertCircle
                        className={dashboardStyles.errorIcon}
                        aria-hidden="true"
                      />
                      {validationErrors.timeLimit}
                    </p>
                  )}
                  <div className={dashboardStyles.timeHint}>
                    <Clock className={dashboardStyles.timeHintIcon} aria-hidden="true" />
                    <span>
                      Time allocated per participant to complete the quiz
                    </span>
                  </div>
                </div>

                {/* CSV Upload Dropzone */}
                <div>
                  <label
                    htmlFor="quiz-csv-input"
                    className={dashboardStyles.label}
                  >
                    Upload Questions (CSV){" "}
                    <span
                      className={dashboardStyles.requiredMark}
                      aria-hidden="true"
                    >
                      *
                    </span>
                  </label>
                  <div className={dashboardStyles.templateRow}>
                    <span className={dashboardStyles.templateHint}>
                      Columns: Question, Option A–D, Answer (letter or text)
                    </span>
                    <button
                      type="button"
                      onClick={downloadCsvTemplate}
                      className={dashboardStyles.templateButton}
                    >
                      <Download
                        className={dashboardStyles.templateIcon}
                        aria-hidden="true"
                      />
                      Download template
                    </button>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Upload questions CSV: drag and drop, or press Enter to choose a file"
                    className={`${dashboardStyles.dropzoneBase} ${
                      isDragging
                        ? dashboardStyles.dropzoneDragging
                        : validationErrors.questions
                        ? dashboardStyles.dropzoneError
                        : dashboardStyles.dropzoneNormal
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current && fileInputRef.current.click();
                      }
                    }}
                  >
                    <input
                      id="quiz-csv-input"
                      type="file"
                      accept=".csv"
                      ref={fileInputRef}
                      className={dashboardStyles.hiddenInput}
                      onChange={handleFileUpload}
                    />
                    <div className={dashboardStyles.uploadIconWrap} aria-hidden="true">
                      <UploadCloud className={dashboardStyles.uploadIcon} />
                    </div>
                    <div className={dashboardStyles.dropzoneTextPrimary}>Drag & drop or click to upload CSV</div>
                    <div className={dashboardStyles.dropzoneTextSecondary}>Format: Question, Option A, Option B, Option C, Option D, Answer</div>
                  </div>
                  {validationErrors.questions && (
                    <p
                      id="quiz-questions-error"
                      className={dashboardStyles.errorMessage}
                      role="alert"
                    >
                      <AlertCircle
                        className={dashboardStyles.errorIcon}
                        aria-hidden="true"
                      />
                      {validationErrors.questions}
                    </p>
                  )}
                  {questions.length > 0 && (
                    <div className={dashboardStyles.successContainer}>
                      <div className={dashboardStyles.successInner}>
                        <div className={dashboardStyles.successLeft}>
                          <CheckCircle2
                            className={dashboardStyles.successIcon}
                            aria-hidden="true"
                          />
                          <span className={dashboardStyles.successText}>{questions.length} questions loaded</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            className={dashboardStyles.previewToggleButton}
                            type="button"
                            aria-expanded={showPreview}
                            onClick={() => setShowPreview((prev) => !prev)}
                          >
                            {showPreview ? (
                              <>
                                <EyeOff className={dashboardStyles.previewIcon} aria-hidden="true" />
                                <span>Hide Preview</span>
                              </>
                            ) : (
                              <>
                                <Eye className={dashboardStyles.previewIcon} aria-hidden="true" />
                                <span>Show Preview</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            className={dashboardStyles.clearButton}
                            onClick={handleClearForm}
                          >
                            <Trash2 className={dashboardStyles.clearIcon} aria-hidden="true" />
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="button"
                  className={`${dashboardStyles.submitBase} ${
                    formComplete
                      ? dashboardStyles.submitValid
                      : dashboardStyles.submitInvalid
                  }`}
                  onClick={handleSubmit}
                  disabled={!formComplete}
                >
                  <span className={dashboardStyles.submitInner}>
                    <Sparkles className={dashboardStyles.submitIcon} aria-hidden="true" />
                    Create Quiz
                  </span>
                </button>
              </div>
            </div>

            {/* Preview Section */}
            {showPreview && questions.length > 0 && (
              <div className={dashboardStyles.previewCard}>
                <div className={dashboardStyles.previewHeader}>
                  <div>
                    <div className={dashboardStyles.previewTitle}>Preview Questions</div>
                    <div className={dashboardStyles.previewSubtitle}>{questions.length} questions</div>
                  </div>
                  <div className={dashboardStyles.previewRight}>
                    <span className={dashboardStyles.timeBadge}>
                      <Clock className={dashboardStyles.timeBadgeIcon} aria-hidden="true" />
                      <span className={dashboardStyles.timeBadgeText}>{timeLimit} min</span>
                    </span>
                    <span className={dashboardStyles.countBadge}>{questions.length} Qs</span>
                  </div>
                </div>

                {questions.length > 3 && (
                  <div className={dashboardStyles.previewSearchWrap}>
                    <Search
                      className={dashboardStyles.previewSearchIcon}
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      aria-label="Search loaded questions"
                      placeholder="Search loaded questions..."
                      value={previewQuery}
                      onChange={(e) => setPreviewQuery(e.target.value)}
                      className={dashboardStyles.previewSearchInput}
                    />
                    {previewQuery && (
                      <button
                        type="button"
                        aria-label="Clear question search"
                        className={dashboardStyles.previewRemove}
                        onClick={() => setPreviewQuery("")}
                      >
                        <X className={dashboardStyles.previewRemoveIcon} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}

                <div className={dashboardStyles.previewList}>
                  {visiblePreview.map(({ q, index: idx }) => (
                    <div key={`${idx}-${q.question.slice(0, 16)}`} className={dashboardStyles.previewItem}>
                      <div className={dashboardStyles.previewItemTop}>
                        <div className={dashboardStyles.previewNumber}>{idx + 1}</div>
                        <div className={dashboardStyles.previewContent}>
                          <div className={dashboardStyles.previewQuestion}>{q.question}</div>
                          <div className={dashboardStyles.optionsGrid}>
                            {q.options.map((opt, i) => (
                              <div
                                key={i}
                                className={`${dashboardStyles.optionItemBase} ${
                                  q.answerKey === letterForIndex(i)
                                    ? dashboardStyles.optionItemCorrect
                                    : dashboardStyles.optionItemIncorrect
                                }`}
                              >
                                <span
                                  className={`${dashboardStyles.optionLetterBase} ${
                                    q.answerKey === letterForIndex(i)
                                      ? dashboardStyles.optionLetterCorrect
                                      : dashboardStyles.optionLetterIncorrect
                                  }`}
                                >
                                  {letterForIndex(i)}
                                </span>
                                <span
                                  className={
                                    q.answerKey === letterForIndex(i)
                                      ? dashboardStyles.optionTextCorrect
                                      : dashboardStyles.optionTextIncorrect
                                  }
                                >
                                  {opt || <span className={dashboardStyles.optionEmptyText}>Empty</span>}
                                </span>
                                {q.answerKey === letterForIndex(i) && (
                                  <CheckCircle2
                                    className={dashboardStyles.correctIconSvg}
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                          <div className={dashboardStyles.optionFooter}>
                            <span className={dashboardStyles.answerBadge}>
                              <CheckCircle2
                                className={dashboardStyles.answerBadgeIcon}
                                aria-hidden="true"
                              />
                              <span className={dashboardStyles.answerBadgeText}>Correct: {q.answerKey} - {q.answerText}</span>
                            </span>
                            <span className={dashboardStyles.positionText}>Q{idx + 1} of {questions.length}</span>
                          </div>
                        </div>
                        <div className={dashboardStyles.previewActions}>
                          <button
                            type="button"
                            aria-label={`Remove question ${idx + 1}`}
                            className={dashboardStyles.previewRemove}
                            onClick={() => removeQuestion(idx)}
                          >
                            <Trash2 className={dashboardStyles.previewRemoveIcon} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {visiblePreview.length === 0 && (
                    <p className={dashboardStyles.previewSubtitle}>
                      No questions match your search.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Tips & Summary */}
          <div className={dashboardStyles.rightColumn}>
            {/* Quick Tips Card */}
            <aside className={dashboardStyles.tipsCard}>
              <h2 className={dashboardStyles.tipsTitle}>Quick Tips</h2>
              <ol className={dashboardStyles.tipsList}>
                <li className={dashboardStyles.tipsItem}>
                  <span
                    className={dashboardStyles.tipsNumber}
                    aria-hidden="true"
                  >
                    1
                  </span>
                  <span className={dashboardStyles.tipsText}>
                    All fields marked with * are required
                  </span>
                </li>
                <li className={dashboardStyles.tipsItem}>
                  <span
                    className={dashboardStyles.tipsNumber}
                    aria-hidden="true"
                  >
                    2
                  </span>
                  <span className={dashboardStyles.tipsText}>
                    Preview questions before creating quiz
                  </span>
                </li>
                <li className={dashboardStyles.tipsItem}>
                  <span
                    className={dashboardStyles.tipsNumber}
                    aria-hidden="true"
                  >
                    3
                  </span>
                  <span className={dashboardStyles.tipsText}>
                    Set appropriate time limit based on difficulty level
                  </span>
                </li>
              </ol>
            </aside>

            {/* CSV guide */}
            <div className={dashboardStyles.summaryCard}>
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <h3 className={dashboardStyles.summaryTitle}>CSV format</h3>
              </div>
              <p className={dashboardStyles.cardHint}>
                One question per row. Answer accepts A–D, 1–4, or the option
                text itself.
              </p>
              <div className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3">
                <code className="whitespace-nowrap font-mono text-xs text-slate-200">
                  Question,A,B,C,D,Answer
                </code>
              </div>
            </div>

            {/* Summary Card */}
            <div className={dashboardStyles.summaryCard}>
              <div className={dashboardStyles.summaryTitle}>Quiz Summary</div>
              <div className={dashboardStyles.summaryRows}>
                <div className={dashboardStyles.summaryRow}>
                  <span className={dashboardStyles.summaryLabel}>Technology</span>
                  <span className={dashboardStyles.summaryValue}>{technology || '-'}</span>
                </div>
                <div className={dashboardStyles.summaryRow}>
                  <span className={dashboardStyles.summaryLabel}>Level</span>
                  <span className={dashboardStyles.summaryValue}>{level}</span>
                </div>
                <div className={dashboardStyles.summaryRow}>
                  <span className={dashboardStyles.summaryLabel}>Time Limit</span>
                  <span className={dashboardStyles.summaryValue}>{timeLimit} min</span>
                </div>
                <div className={dashboardStyles.summaryRow}>
                  <span className={dashboardStyles.summaryLabel}>Questions</span>
                  <span className={dashboardStyles.summaryValue}>{questions.length}</span>
                </div>
              </div>
              <div className={dashboardStyles.summaryStatusRow}>
                <span className={`${dashboardStyles.statusBadgeBase} ${
                  formComplete
                    ? dashboardStyles.statusBadgeReady
                    : dashboardStyles.statusBadgeIncomplete
                }`}>
                  <span className={dashboardStyles.statusBadgeDot} aria-hidden="true" />
                  {formComplete ? "Ready to Submit" : "Incomplete"}
                </span>
                <button
                  type="button"
                  onClick={handleClearForm}
                  className={dashboardStyles.statsRetry}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Toast Notification — role already implies the right politeness
            level (alert → assertive, status → polite). */}
        <div
          role={toast.type === "error" ? "alert" : "status"}
          className={`${dashboardStyles.toastOuter} ${toast.show ? dashboardStyles.toastVisible : dashboardStyles.toastHidden}`}
          style={{ pointerEvents: toast.show ? "auto" : "none" }}
        >
          <div
            className={`${dashboardStyles.toastInner} ${
              toast.type === "success"
                ? dashboardStyles.toastSuccess
                : toast.type === "error"
                ? dashboardStyles.toastError
                : dashboardStyles.toastInfo
            }`}
          >
            <span>
              {toast.type === "success" && (
                <CheckCircle2 className={dashboardStyles.toastIconSuccess} aria-hidden="true" />
              )}
              {toast.type === "error" && (
                <AlertCircle className={dashboardStyles.toastIconError} aria-hidden="true" />
              )}
              {toast.type === "info" && (
                <ArrowRight className={dashboardStyles.toastIconInfo} aria-hidden="true" />
              )}
            </span>
            <span
              className={`${dashboardStyles.toastTextBase} ${
                toast.type === "success"
                  ? dashboardStyles.toastTextSuccess
                  : toast.type === "error"
                  ? dashboardStyles.toastTextError
                  : dashboardStyles.toastTextInfo
              }`}
            >
              {toast.message}
            </span>
            <button
              className={dashboardStyles.toastCloseButton}
              onClick={() => setToast((prev) => ({ ...prev, show: false }))}
              aria-label="Dismiss notification"
              style={{ marginLeft: "auto" }}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard
