import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  listPageStyles,
  levelBadgeTone,
  getLevelTone,
} from "../assets/dummyStyles.jsx";
import { useApi } from "../services/api/api.js";

import {
  AlertCircle,
  ArrowDownUp,
  Calendar,
  CheckCircle,
  ChevronDown,
  Clock,
  Copy,
  Cpu,
  Download,
  Eye,
  FileText,
  Filter,
  Layers,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "questions", label: "Most questions" },
  { value: "time", label: "Longest time" },
];

const timeOf = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const SORTERS = {
  newest: (a, b) => timeOf(b.uploadDate) - timeOf(a.uploadDate),
  oldest: (a, b) => timeOf(a.uploadDate) - timeOf(b.uploadDate),
  name: (a, b) => a.name.localeCompare(b.name),
  questions: (a, b) => (b.questions || 0) - (a.questions || 0),
  time: (a, b) => (b.timeLimit || 0) - (a.timeLimit || 0),
};

const List = () => {
  const [technologies, setTechnologies] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [showDropdown, setShowDropdown] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState({
    open: false,
    techId: null,
    techName: "",
  });

  // Focus returns here when the dialog closes, so keyboard users land back
  // on the control that opened it.
  const deleteTriggerRef = useRef(null);
  // The open delete dialog panel, for the Tab focus trap (parity with the
  // learner app's confirmation dialogs).
  const dialogRef = useRef(null);

  // One DELETE at a time: a second confirm while the first is in flight used
  // to fire another request and surface a wrong "Delete failed!" toast.
  const deletingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);

  // One duplicate at a time for the same reason.
  const duplicatingRef = useRef(false);
  const [duplicating, setDuplicating] = useState(false);

  // The level menu dismisses on outside click like every other menu.
  const filterWrapRef = useRef(null);

  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const toastTimerRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();

  const { request } = useApi();

  const showToast = (message, type) => {
    setToast({ visible: true, message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(
      () => setToast((prev) => ({ ...prev, visible: false })),
      2000,
    );
  };

  // Fetch quizzes from backend: loading, ready and error+retry states.
  useEffect(() => {
    let mounted = true;
    const fetchQuizzes = async () => {
      setStatus("loading");
      try {
        const data = await request("/admin/quizzes");
        if (!mounted) return;
        const formatted = (data?.quizzes || []).map((q) => ({
          id: q._id || q.id,
          name: q.technology || q.name || "Untitled quiz",
          level: q.level,
          timeLimit: q.timeLimit,
          questions: q.totalQuestions || (q.questions ? q.questions.length : 0),
          uploadDate: q.createdAt || q.uploadDate,
        }));
        setTechnologies(formatted);
        setErrorMessage("");
        setStatus("ready");
      } catch (err) {
        if (!mounted) return;
        setTechnologies([]);
        setErrorMessage(err?.message || "Please try again.");
        setStatus("error");
      }
    };
    fetchQuizzes();
    return () => {
      mounted = false;
    };
  }, [location, attempt]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Escape closes the delete dialog or the level menu, like every other
  // dialog in the apps; closing the dialog restores focus to its trigger.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setConfirmDelete((prev) =>
        prev.open ? { open: false, techId: null, techName: "" } : prev,
      );
      if (confirmDelete.open) deleteTriggerRef.current?.focus?.();
      setShowDropdown(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete.open]);

  // Outside click dismisses the level menu (the filter button itself toggles).
  useEffect(() => {
    if (!showDropdown) return;
    const onDocClick = (event) => {
      if (!filterWrapRef.current?.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [showDropdown]);

  const closeConfirmDelete = () => {
    setConfirmDelete({ open: false, techId: null, techName: "" });
    deleteTriggerRef.current?.focus?.();
  };

  // DELETE — same endpoint and confirmation flow as before.
  const deleteTechnology = async (id) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await request(`/admin/quiz/${id}`, "DELETE");
      setTechnologies((prev) => prev.filter((tech) => tech.id !== id));
      showToast("Deleted successfully!", "success");
    } catch {
      showToast("Delete failed!", "error");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  // DUPLICATE — the copy is assembled server-side, so answer keys never
  // travel through the browser. Refetch keeps the list authoritative.
  const duplicateQuiz = async (id, name) => {
    if (duplicatingRef.current) return;
    duplicatingRef.current = true;
    setDuplicating(true);
    try {
      await request(`/admin/quiz/${id}/duplicate`, "POST");
      showToast(`"${name}" duplicated successfully!`, "success");
      setAttempt((n) => n + 1);
    } catch (err) {
      showToast(err?.message || "Duplicate failed!", "error");
    } finally {
      duplicatingRef.current = false;
      setDuplicating(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return "—";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return "—";
    return `${parsed.getDate()} ${parsed.toLocaleString("en-US", {
      month: "short",
    })}, ${parsed.getFullYear()}`;
  };

  const getLevelColor = (level) => levelBadgeTone(level);

  const getLevelIcon = (level) => {
    if (level === "Basic")
      return <CheckCircle className="h-4 w-4" aria-hidden="true" />;
    if (level === "Intermediate")
      return <AlertCircle className="h-4 w-4" aria-hidden="true" />;
    return <XCircle className="h-4 w-4" aria-hidden="true" />;
  };

  const searchNeedle = searchTerm.trim().toLowerCase();

  const filteredTechnologies = technologies
    .filter((t) => {
      const matchSearch = t.name.toLowerCase().includes(searchNeedle);
      const matchLevel = selectedLevel === "All" || t.level === selectedLevel;
      return matchSearch && matchLevel;
    })
    .sort(SORTERS[sortBy] || SORTERS.newest);

  const filtersActive = searchTerm.trim() !== "" || selectedLevel !== "All";

  const levelOptions = [
    { value: "All", label: "All Levels" },
    { value: "Basic", label: "Basic" },
    { value: "Intermediate", label: "Intermediate" },
    { value: "Advanced", label: "Advanced" },
  ];

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedLevel("All");
  };

  // Catalog overview, computed from the loaded list only (no extra requests).
  const totalQuestions = technologies.reduce(
    (sum, t) => sum + (Number(t.questions) || 0),
    0,
  );
  const levelsUsed = new Set(
    technologies.map((t) => t.level).filter(Boolean),
  ).size;
  const latestUpload = technologies.reduce(
    (latest, t) => Math.max(latest, timeOf(t.uploadDate)),
    0,
  );

  const exportCatalog = () => {
    try {
      const header = "Technology,Level,Time Limit (min),Questions,Created At";
      const rows = technologies.map((t) => {
        const uploadedAt = timeOf(t.uploadDate);
        return [
          `"${String(t.name).replace(/"/g, '""')}"`,
          t.level || "",
          t.timeLimit ?? "",
          t.questions ?? 0,
          uploadedAt ? new Date(uploadedAt).toISOString() : "",
        ].join(",");
      });
      const blob = new Blob([[header, ...rows].join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tech-quiz-catalog.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Catalog exported successfully!", "success");
    } catch {
      showToast("Export failed!", "error");
    }
  };

  return (
    <div className={listPageStyles.page}>
      <div className={listPageStyles.container}>
        {/* HEADER */}
        <header className={listPageStyles.headerWrapper}>
          <div className={listPageStyles.headerRow}>
            <div>
              <span className={listPageStyles.headerEyebrow}>
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                Quiz management
              </span>
              <h1 className={listPageStyles.title}>Quizzes</h1>
              <p className={listPageStyles.subtitle}>
                Review every uploaded quiz and remove the ones you no longer need.
              </p>
            </div>
            <div className={listPageStyles.headerActions}>
              <button
                type="button"
                className={listPageStyles.exportButton}
                onClick={exportCatalog}
                disabled={status !== "ready" || technologies.length === 0}
              >
                <Download className={listPageStyles.exportIcon} aria-hidden="true" />
                Export CSV
              </button>
              <button
                type="button"
                className={listPageStyles.newQuizButton}
                onClick={() => navigate("/dashboard")}
              >
                <Plus className={listPageStyles.newQuizIcon} aria-hidden="true" />
                New quiz
              </button>
            </div>
          </div>
        </header>

        {/* OVERVIEW — real values computed from the loaded catalog */}
        {status === "ready" && technologies.length > 0 && (
          <div className={listPageStyles.overview}>
            <div className={listPageStyles.overviewCard}>
              <span
                className={`${listPageStyles.overviewIconBox} ${listPageStyles.overviewIconIndigo}`}
                aria-hidden="true"
              >
                <Layers className={listPageStyles.overviewIcon} />
              </span>
              <div>
                <div className={listPageStyles.overviewLabel}>Quizzes</div>
                <div className={listPageStyles.overviewValue}>
                  {technologies.length}
                </div>
              </div>
            </div>
            <div className={listPageStyles.overviewCard}>
              <span
                className={`${listPageStyles.overviewIconBox} ${listPageStyles.overviewIconEmerald}`}
                aria-hidden="true"
              >
                <FileText className={listPageStyles.overviewIcon} />
              </span>
              <div>
                <div className={listPageStyles.overviewLabel}>Questions</div>
                <div className={listPageStyles.overviewValue}>
                  {totalQuestions}
                </div>
              </div>
            </div>
            <div className={listPageStyles.overviewCard}>
              <span
                className={`${listPageStyles.overviewIconBox} ${listPageStyles.overviewIconAmber}`}
                aria-hidden="true"
              >
                <Cpu className={listPageStyles.overviewIcon} />
              </span>
              <div>
                <div className={listPageStyles.overviewLabel}>Levels used</div>
                <div className={listPageStyles.overviewValue}>{levelsUsed}</div>
              </div>
            </div>
            <div className={listPageStyles.overviewCard}>
              <span
                className={`${listPageStyles.overviewIconBox} ${listPageStyles.overviewIconViolet}`}
                aria-hidden="true"
              >
                <Calendar className={listPageStyles.overviewIcon} />
              </span>
              <div>
                <div className={listPageStyles.overviewLabel}>Latest upload</div>
                <div className={listPageStyles.overviewMeta}>
                  {latestUpload ? formatDate(new Date(latestUpload)) : "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SEARCH, FILTER & SORT */}
        <div className={listPageStyles.toolbar}>
          <div className={listPageStyles.searchCard}>
            <Search
              className={listPageStyles.searchIcon}
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Search quizzes by technology"
              placeholder="Search technologies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={listPageStyles.searchInput}
            />
            {searchTerm && (
              <button
                type="button"
                aria-label="Clear search"
                className={listPageStyles.searchClear}
                onClick={() => setSearchTerm("")}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className={listPageStyles.filterWrap} ref={filterWrapRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={showDropdown}
              className={listPageStyles.filterButton}
              onClick={() => setShowDropdown((prev) => !prev)}
            >
              <Filter className={listPageStyles.filterIcon} aria-hidden="true" />
              {levelOptions.find((opt) => opt.value === selectedLevel)?.label ||
                "All Levels"}
              <ChevronDown
                className={listPageStyles.filterChevron}
                aria-hidden="true"
              />
            </button>
            {showDropdown && (
              <div className={listPageStyles.filterMenu} role="menu">
                {levelOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedLevel === opt.value}
                    className={`${listPageStyles.filterOption} ${
                      selectedLevel === opt.value
                        ? listPageStyles.filterOptionActive
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedLevel(opt.value);
                      setShowDropdown(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={listPageStyles.sortWrap}>
            <label className={listPageStyles.sortLabel} htmlFor="quiz-sort">
              Sort quizzes
            </label>
            <ArrowDownUp
              className={listPageStyles.sortIcon}
              aria-hidden="true"
            />
            <select
              id="quiz-sort"
              className={listPageStyles.sortSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className={listPageStyles.sortChevron}
              aria-hidden="true"
            />
          </div>
        </div>

        {filtersActive && status === "ready" && (
          <p className={listPageStyles.resultCount} role="status">
            {filteredTechnologies.length} of {technologies.length} quizzes
          </p>
        )}

        {/* LOADING */}
        {status === "loading" && (
          <div
            className={listPageStyles.loadingGrid}
            role="status"
            aria-busy="true"
          >
            <span className="sr-only">Loading quizzes…</span>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={listPageStyles.loadingCard}>
                <div
                  className={`${listPageStyles.skeletonLine} mb-3 h-5 w-2/3`}
                />
                <div
                  className={`${listPageStyles.skeletonLine} mb-2 h-4 w-full`}
                />
                <div
                  className={`${listPageStyles.skeletonLine} mb-4 h-4 w-1/2`}
                />
                <div className={`${listPageStyles.skeletonLine} h-10 w-full`} />
              </div>
            ))}
          </div>
        )}

        {/* ERROR */}
        {status === "error" && (
          <div className={listPageStyles.errorCard} role="alert">
            <h2 className={listPageStyles.errorTitle}>
              Couldn&apos;t load your quizzes
            </h2>
            <p className={listPageStyles.errorText}>{errorMessage}</p>
            <button
              type="button"
              className={listPageStyles.errorRetry}
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {/* EMPTY OR NO MATCH */}
        {status === "ready" && filteredTechnologies.length === 0 && (
          <div className={listPageStyles.emptyContainer}>
            <div className={listPageStyles.emptyIconBox}>
              <Cpu
                className={listPageStyles.emptyIcon}
                aria-hidden="true"
              />
            </div>
            {technologies.length === 0 ? (
              <>
                <h2 className={listPageStyles.emptyTitle}>
                  No technologies found
                </h2>
                <p className={listPageStyles.emptyText}>
                  Get Started by creating your first technology quiz.
                </p>
                <button
                  type="button"
                  className={listPageStyles.emptyButton}
                  onClick={() => navigate("/dashboard")}
                >
                  <Plus
                    className={listPageStyles.emptyButtonIcon}
                    aria-hidden="true"
                  />
                  <span className={listPageStyles.emptyButtonText}>
                    Create First Quiz
                  </span>
                </button>
              </>
            ) : (
              <>
                <h2 className={listPageStyles.emptyTitle}>
                  No quizzes match your filters
                </h2>
                <p className={listPageStyles.emptyText}>
                  Try a different search term or level.
                </p>
                <button
                  type="button"
                  className={listPageStyles.clearFiltersButton}
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        )}

        {/* CARDS */}
        {status === "ready" && filteredTechnologies.length > 0 && (
          <div className={listPageStyles.grid}>
            {filteredTechnologies.map((tech) => {
              const tone = getLevelTone(tech.level);
              return (
              <div key={tech.id} className={listPageStyles.cardGroup}>
                <div className={listPageStyles.card}>
                  <div
                    className={`${listPageStyles.cardAccent} ${tone.soft}`}
                    aria-hidden="true"
                  />
                  {/* HEADER */}
                  <div className={listPageStyles.cardHeader}>
                    <div className={listPageStyles.cardHeaderInner}>
                      <div className={listPageStyles.cardHeaderLeft}>
                        <div
                          className={`${listPageStyles.iconWrapper} ${tone.bg} ${tone.text} ${tone.border}`}
                        >
                          <Cpu className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <h2 className={listPageStyles.techName}>{tech.name}</h2>
                      </div>
                      <span
                        className={`${listPageStyles.levelBadgeBase} ${getLevelColor(tech.level)}`}
                      >
                        {getLevelIcon(tech.level)}
                        {tech.level || "Unknown"}
                      </span>
                    </div>
                  </div>
                  {/* BODY */}
                  <div className={listPageStyles.cardBody}>
                    <div className={listPageStyles.cardBodyContent}>
                      <div className={listPageStyles.metaRow}>
                        <span className={listPageStyles.metaItem}>
                          <Clock
                            className={listPageStyles.metaIcon}
                            aria-hidden="true"
                          />
                          <span className={listPageStyles.metaValue}>
                            {tech.timeLimit != null
                              ? `${tech.timeLimit} min`
                              : "—"}
                          </span>
                        </span>
                        <span className={listPageStyles.metaItem}>
                          <FileText
                            className={listPageStyles.metaIcon}
                            aria-hidden="true"
                          />
                          <span className={listPageStyles.metaValue}>
                            {tech.questions} questions
                          </span>
                        </span>
                        <span className={listPageStyles.metaItem}>
                          <Calendar
                            className={listPageStyles.metaIcon}
                            aria-hidden="true"
                          />
                          <span className={listPageStyles.metaValue}>
                            {formatDate(tech.uploadDate)}
                          </span>
                        </span>
                      </div>
                    </div>
                    {/* ACTIONS */}
                    <div className={listPageStyles.cardFooter}>
                      <button
                        type="button"
                        onClick={() => navigate(`/quiz/${tech.id}`)}
                        className={listPageStyles.viewButton}
                        aria-label={`View ${tech.name}`}
                      >
                        <Eye className={listPageStyles.viewIcon} aria-hidden="true" />
                        View
                      </button>
                      <div className={listPageStyles.cardFooterActions}>
                        <button
                          type="button"
                          disabled={duplicating}
                          onClick={() => duplicateQuiz(tech.id, tech.name)}
                          className={listPageStyles.duplicateButton}
                          aria-label={`Duplicate ${tech.name}`}
                          title={`Duplicate ${tech.name}`}
                        >
                          <Copy className={listPageStyles.duplicateIcon} aria-hidden="true" />
                          Duplicate
                        </button>
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => {
                            deleteTriggerRef.current = document.activeElement;
                            setConfirmDelete({
                              open: true,
                              techId: tech.id,
                              techName: tech.name,
                            });
                          }}
                          className={listPageStyles.deleteButton}
                          aria-label={`Delete ${tech.name}`}
                        >
                          <Trash2
                            className={listPageStyles.trashIcon}
                            aria-hidden="true"
                          />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* DELETE CONFIRMATION */}
        {confirmDelete.open && (
          <div
            className={listPageStyles.modalOverlay}
            onClick={closeConfirmDelete}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const focusable = dialogRef.current?.querySelectorAll(
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
              ref={dialogRef}
              className={listPageStyles.modalCard}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-quiz-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={listPageStyles.modalIconBox} aria-hidden="true">
                <Trash2 className={listPageStyles.modalIcon} />
              </div>
              <h3 id="delete-quiz-title" className={listPageStyles.modalTitle}>
                Delete Quiz?
              </h3>
              <p className={listPageStyles.modalText}>
                Are you sure you want to delete{" "}
                <span className={listPageStyles.modalName}>
                  {confirmDelete.techName}
                </span>
                ? This action cannot be undone.
              </p>
              <div className={listPageStyles.modalActions}>
                <button
                  type="button"
                  autoFocus
                  onClick={closeConfirmDelete}
                  className={listPageStyles.modalCancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteTechnology(confirmDelete.techId);
                    closeConfirmDelete();
                  }}
                  className={listPageStyles.modalDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DELETE FEEDBACK */}
        {toast.visible && (
          <div
            className={listPageStyles.toastContainer}
            role={toast.type === "error" ? "alert" : "status"}
          >
            <div
              className={`${listPageStyles.toastInner} ${
                toast.type === "error"
                  ? listPageStyles.toastError
                  : listPageStyles.toastSuccess
              }`}
            >
              {toast.type === "error" ? (
                <XCircle
                  className={listPageStyles.toastIconError}
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle
                  className={listPageStyles.toastIconSuccess}
                  aria-hidden="true"
                />
              )}
              <span className={listPageStyles.toastMessage}>{toast.message}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
                className={listPageStyles.toastClose}
                onClick={() =>
                  setToast((prev) => ({ ...prev, visible: false }))
                }
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default List;
