// Centralized styles for the admin app.
//
// One visual language across every admin screen: soft slate surfaces,
// hairline borders, a single indigo/violet accent, rounded-2xl cards and
// visible focus rings. Level colours come from one shared tone map so the
// dashboard, list and detail screens can never drift apart.

// Shared difficulty-level palette. The create form's selected level, the
// list badge and the quiz-detail badge all read from this one map.
const LEVEL_TONES = {
  Basic: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-100",
    dot: "bg-emerald-500",
    soft: "from-emerald-400 to-teal-500",
  },
  Intermediate: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-100",
    dot: "bg-amber-500",
    soft: "from-amber-400 to-orange-500",
  },
  Advanced: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-100",
    dot: "bg-rose-500",
    soft: "from-rose-500 to-pink-600",
  },
};

const NEUTRAL_LEVEL_TONE = {
  bg: "bg-slate-100",
  text: "text-slate-600",
  border: "border-slate-200",
  dot: "bg-slate-400",
  soft: "from-slate-400 to-slate-600",
};

/** Tone parts {bg, text, border, dot, soft} for a level name; neutral when unknown. */
export const getLevelTone = (level) => LEVEL_TONES[level] || NEUTRAL_LEVEL_TONE;

/** One-shot badge class string for list/detail level badges. */
export const levelBadgeTone = (level) => {
  const tone = getLevelTone(level);
  return `${tone.bg} ${tone.text} ${tone.border}`;
};

// ==================== Shared registry primitives ====================
// Small reusable strings so buttons/inputs never drift between screens.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2";
const CARD_BASE = "rounded-2xl border border-slate-200 bg-white shadow-sm";

export const sharedStyles = {
  focusRing: FOCUS_RING,
  cardBase: CARD_BASE,
};

export const navbarStyles = {
  // Navigation bar
  nav: "sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75",
  container: "mx-auto max-w-7xl px-4 sm:px-6 lg:px-8",
  innerContainer: "relative flex h-16 items-center justify-between gap-3",

  // Left: Logo + site name (the home control keeps a visible focus ring)
  homeButton:
    "group flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
  logoWrapper:
    "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-sm",
  logoImg: "h-6 w-6 rounded object-cover",
  siteNameWrapper: "flex min-w-0 flex-col items-start",
  siteName:
    "truncate text-base font-bold tracking-tight text-slate-900 md:text-lg",
  siteSubtitle: "text-[11px] font-semibold uppercase tracking-wider text-indigo-500",

  // Desktop center navigation
  desktopCenterContainer:
    "absolute left-1/2 hidden -translate-x-1/2 md:block",
  desktopCenterInner:
    "flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1",

  // Desktop navigation buttons (shared base + active state)
  dashboardButton:
    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
  dashboardIcon: "h-4 w-4",
  dashboardText: "leading-none",
  dashboardButtonActive:
    "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200 hover:bg-white hover:text-indigo-700",

  listButton:
    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
  listIcon: "h-4 w-4",
  listText: "leading-none",
  listButtonActive:
    "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200 hover:bg-white hover:text-indigo-700",

  // Desktop right content
  desktopRightContent: "flex items-center gap-3",

  // Default profile button (desktop)
  profileGroup: "relative",
  profileButton:
    "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
  profileIcon: "h-5 w-5",

  // Mobile menu trigger (40px target, accessible name + expanded state)
  mobileMenuContainer: "flex items-center md:hidden",
  hamburgerButton:
    "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
  menuIcon: "h-5 w-5",
  xIcon: "h-5 w-5",

  // Mobile overlay menu (solid panel; reads the same as the cards)
  mobileOverlay: "fixed inset-0 z-40 md:hidden",
  mobileBackdrop: "absolute inset-0 bg-black/40",
  mobilePanel:
    "absolute left-4 right-4 top-16 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:left-auto sm:w-80",
  mobileNav: "flex flex-col gap-1",

  // Mobile navigation items
  mobileNavButton:
    "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  mobileNavButtonActive: "bg-indigo-50 text-indigo-700",
  mobileNavIcon: "h-5 w-5 text-indigo-600",
  mobileNavItemTitle: "font-semibold text-slate-800",
  mobileNavItemSubtitle: "text-xs text-slate-500",

  // Right content inside mobile menu (if provided)
  mobileRightContentContainer: "mt-2 border-t border-slate-200 pt-3",
  mobileRightContentInner: "w-full",
};

// ==================== Dashboard / Create Quiz Styles ====================
export const dashboardStyles = {
  // ----- Layout -----
  page: "min-h-screen bg-slate-50 p-4 md:p-8",
  container: "mx-auto max-w-7xl",

  // ----- Header -----
  headerWrapper: "mb-6 md:mb-8",
  headerRow:
    "flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between",
  headerEyebrow:
    "mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-600",
  headerEyebrowDot: "h-1.5 w-1.5 rounded-full bg-indigo-500",
  title: "text-2xl md:text-3xl font-bold tracking-tight text-slate-900",
  subtitle: "mt-1 text-sm text-slate-600",
  headerActions: "flex flex-wrap items-center gap-2",
  headerLink:
    "inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  headerLinkIcon: "h-4 w-4",
  headerPrimaryLink:
    "inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
  headerPrimaryIcon: "h-4 w-4",

  // ----- Stats (real GET /admin/stats values only) -----
  statsCard: `${CARD_BASE} mb-6 overflow-hidden p-4 md:p-5`,
  statsHeader: "mb-4 flex flex-wrap items-center justify-between gap-3",
  statsHeaderLeft: "flex items-center gap-3",
  statsIconBox:
    "flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600",
  statsIcon: "h-4.5 w-4.5",
  statsTitle: "text-sm font-semibold text-slate-900",
  statsSubtitle: "text-xs text-slate-500",
  statsGrid: "grid grid-cols-2 gap-3 lg:grid-cols-4",
  statCard:
    "relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 transition-colors hover:border-slate-300 hover:bg-white hover:shadow-sm",
  statCardContent: "flex items-start gap-3",
  statTextWrap: "min-w-0 flex-1",
  statIconBox:
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200",
  statIcon: "h-4 w-4",
  statIconIndigo: "text-indigo-600",
  statIconEmerald: "text-emerald-600",
  statIconAmber: "text-amber-600",
  statIconViolet: "text-violet-600",
  statLabel: "text-xs font-medium text-slate-500",
  statValue: "text-xl font-bold tabular-nums tracking-tight text-slate-900",
  statMeta: "mt-0.5 text-xs text-slate-500",
  statSkeleton: "h-7 w-16 animate-pulse rounded-lg bg-slate-200",
  statsErrorRow:
    "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600",
  statsRetry:
    "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  loginProgressTrack: "mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200",
  loginProgressFill:
    "h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500",
  levelSplit: "mt-3 flex flex-wrap gap-2",
  levelSplitItem:
    "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600",

  // ----- Recent uploads -----
  recentCard: `${CARD_BASE} mt-4 p-4`,
  recentHeader: "mb-3 flex items-center justify-between gap-3",
  recentTitle: "text-sm font-semibold text-slate-900",
  recentHint: "text-xs text-slate-500",
  recentList: "divide-y divide-slate-100",
  recentItem:
    "flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0",
  recentItemLeft: "flex min-w-0 items-center gap-3",
  recentAvatar:
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500",
  recentAvatarIcon: "h-4 w-4",
  recentName: "truncate text-sm font-semibold text-slate-800",
  recentMeta: "text-xs text-slate-500",
  recentBadge:
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",

  // ----- Grid -----
  grid: "grid grid-cols-1 gap-6 lg:grid-cols-3",
  mainColumn: "space-y-6 lg:col-span-2",

  // ----- Form Card -----
  card: `${CARD_BASE} p-4 md:p-6`,
  sectionHeader: "mb-5 flex items-center gap-3",
  sectionStep:
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm",
  cardTitle: "text-lg font-semibold text-slate-900",
  cardHint: "mt-0.5 text-sm text-slate-500",

  // ----- Form Fields -----
  formFields: "space-y-6",

  // ----- Labels -----
  label: "mb-2 block text-sm font-medium text-slate-700",
  requiredMark: "text-red-500",

  // ----- Input Base -----
  inputBase:
    "w-full rounded-xl border bg-white px-3 py-2.5 text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-400 focus:outline-none md:px-4 md:py-3",
  inputErrorBorder: "border-red-400",
  inputNormalBorder: "border-slate-300",

  // ----- Error Message -----
  errorMessage: "mt-1.5 flex items-center gap-1.5 text-sm text-red-600",
  errorIcon: "h-4 w-4 shrink-0",

  // ----- Difficulty Level Buttons -----
  levelGrid: "grid grid-cols-1 gap-3 sm:grid-cols-3",
  levelButtonBase:
    "w-full cursor-pointer rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 md:p-4",
  levelButtonIdle:
    "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm",
  levelButtonTextBase: "font-semibold",
  levelButtonCaption: "mt-0.5 text-xs opacity-80",

  // ----- Time Limit -----
  timeContainer: "flex flex-col gap-3 sm:flex-row sm:items-center",
  timeInputWrapper: "relative flex-1",
  timeInputBase:
    "w-full rounded-xl border bg-white px-3 py-2.5 text-slate-900 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-400 focus:outline-none md:px-4 md:py-3",
  timeDisplay:
    "rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700",
  timeHint: "mt-2 flex items-center gap-1.5 text-sm text-slate-500",
  timeHintIcon: "h-4 w-4 shrink-0",

  // ----- CSV template helper -----
  templateRow:
    "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2",
  templateHint: "text-xs text-slate-500",
  templateButton:
    "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  templateIcon: "h-3.5 w-3.5",

  // ----- CSV Upload Dropzone -----
  dropzoneBase:
    "cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 md:p-8",
  dropzoneDragging: "border-indigo-500 bg-indigo-50",
  dropzoneError: "border-red-400 bg-red-50",
  dropzoneNormal: "border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/40",
  hiddenInput: "hidden",
  uploadIconWrap:
    "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600",
  uploadIcon: "h-6 w-6",
  dropzoneTextPrimary: "mb-1 font-medium text-slate-700",
  dropzoneTextSecondary: "text-sm text-slate-500",

  // ----- Success Loaded Indicator -----
  successContainer:
    "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 md:p-4",
  successInner: "flex flex-wrap items-center justify-between gap-3",
  successLeft: "flex items-center gap-3",
  successIcon: "h-5 w-5 text-emerald-600",
  successText: "font-medium text-emerald-800",
  previewToggleButton:
    "flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
  previewIcon: "h-4 w-4",
  clearButton:
    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-white hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
  clearIcon: "h-4 w-4",

  // ----- Submit Button -----
  submitBase:
    "w-full rounded-xl py-3 text-lg font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 md:py-4",
  submitValid:
    "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 hover:shadow-md",
  submitInvalid: "cursor-not-allowed bg-slate-100 text-slate-400",
  submitInner: "flex items-center justify-center gap-3",
  submitIcon: "h-5 w-5",

  // ----- Preview Card -----
  previewCard: `${CARD_BASE} p-4 md:p-6`,
  previewHeader:
    "mb-4 flex flex-col gap-4 md:mb-6 sm:flex-row sm:items-center sm:justify-between",
  previewTitle: "text-lg font-semibold text-slate-900 md:text-xl",
  previewSubtitle: "mt-0.5 text-sm text-slate-600",
  previewRight: "flex flex-wrap items-center gap-2",
  previewSearchWrap:
    "relative mb-4 flex items-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100",
  previewSearchIcon: "ml-1.5 h-4 w-4 shrink-0 text-slate-400",
  previewSearchInput:
    "w-full min-w-0 bg-transparent px-2 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none",
  previewItemTop: "flex items-start gap-4",
  timeBadge:
    "flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-indigo-700",
  timeBadgeIcon: "h-4 w-4",
  timeBadgeText: "text-sm font-medium",
  countBadge:
    "rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700",

  // ----- Preview List -----
  previewList: "space-y-4",
  previewItem:
    "rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300 md:p-5",
  previewNumber:
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 font-semibold text-indigo-700",
  previewContent: "min-w-0 flex-1",
  previewQuestion: "break-words font-medium text-slate-900",
  previewActions: "ml-auto flex shrink-0 items-center gap-1",
  previewRemove:
    "flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
  previewRemoveIcon: "h-4 w-4",
  optionsGrid: "mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2",
  optionItemBase: "flex items-center gap-2 rounded-lg border p-3 transition",
  optionItemCorrect: "border-emerald-200 bg-emerald-50",
  optionItemIncorrect: "border-slate-200 bg-slate-50",
  optionLetterBase:
    "flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm font-semibold",
  optionLetterCorrect: "bg-emerald-600 text-white",
  optionLetterIncorrect: "border border-slate-300 bg-white text-slate-600",
  optionTextCorrect: "break-words font-medium text-emerald-800",
  optionTextIncorrect: "break-words text-slate-700",
  optionEmptyText: "text-slate-400",
  correctIcon: "ml-auto shrink-0",
  correctIconSvg: "h-5 w-5 shrink-0 text-emerald-500",
  optionFooter:
    "mt-3 flex flex-col items-start justify-between gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center",
  answerBadge:
    "inline-flex items-center gap-2 break-words rounded-lg bg-emerald-100 px-3 py-1.5 text-emerald-800",
  answerBadgeIcon: "h-4 w-4 shrink-0",
  answerBadgeText: "text-sm font-medium",
  positionText: "text-sm text-slate-500",

  // ----- Right Column (Tips & Summary) -----
  rightColumn: "space-y-6 lg:sticky lg:top-6 lg:self-start",

  // Tips Card
  tipsCard: "rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 md:p-6",
  tipsTitle: "mb-3 text-base font-semibold text-slate-900",
  tipsList: "space-y-3",
  tipsItem: "flex items-start gap-3 text-sm text-slate-700",
  tipsNumber:
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-white text-sm font-semibold text-indigo-600",
  tipsText: "break-words",

  // Summary Card
  summaryCard: `${CARD_BASE} p-4 md:p-6`,
  summaryTitle: "mb-3 text-base font-semibold text-slate-900",
  summaryRows: "space-y-2",
  summaryRow:
    "flex items-center justify-between gap-3 border-b border-slate-100 py-2",
  summaryLabel: "text-slate-600",
  summaryValue: "break-words text-right font-medium text-slate-900",
  summaryStatusRow: "flex items-center justify-between py-2",
  statusBadgeBase: "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
  statusBadgeReady: "bg-emerald-100 text-emerald-800",
  statusBadgeIncomplete: "bg-amber-100 text-amber-800",
  statusBadgeDot: "h-1.5 w-1.5 rounded-full bg-current",

  // ----- Toast Notification -----
  toastOuter:
    "pointer-events-none fixed right-4 top-20 z-50 w-full max-w-sm transition-all duration-300",
  toastVisible: "translate-x-0 opacity-100",
  toastHidden: "translate-x-full opacity-0",
  toastInner:
    "flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg",
  toastSuccess: "border-emerald-200",
  toastError: "border-red-200",
  toastInfo: "border-slate-200",
  toastIconSuccess: "h-5 w-5 shrink-0 text-emerald-600",
  toastIconError: "h-5 w-5 shrink-0 text-red-600",
  toastIconInfo: "h-5 w-5 shrink-0 text-slate-500",
  toastTextBase: "font-medium",
  toastTextSuccess: "text-emerald-800",
  toastTextError: "text-red-800",
  toastTextInfo: "text-slate-700",
  toastCloseButton:
    "ml-auto rounded text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
};

// ==================== ListPage Styles ====================
export const listPageStyles = {
  // ----- Layout -----
  page: "min-h-screen bg-slate-50 p-4 md:p-8",
  container: "mx-auto max-w-7xl",

  // ----- Header -----
  headerWrapper: "mb-6 border-b border-slate-200 pb-6",
  headerRow:
    "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between",
  headerEyebrow:
    "mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-600",
  title: "text-2xl md:text-3xl font-bold tracking-tight text-slate-900",
  subtitle: "mt-1 text-sm text-slate-600",
  headerActions: "flex flex-wrap items-center gap-2",
  exportButton:
    "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50",
  exportIcon: "h-4 w-4",
  newQuizButton:
    "inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
  newQuizIcon: "h-4 w-4",

  // ----- Overview strip (computed client-side from the loaded catalog) -----
  overview: "mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4",
  overviewCard: `${CARD_BASE} flex items-center gap-3 p-3.5`,
  overviewIconBox:
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100",
  overviewIcon: "h-5 w-5",
  overviewIconIndigo: "bg-indigo-50 text-indigo-600",
  overviewIconEmerald: "bg-emerald-50 text-emerald-600",
  overviewIconAmber: "bg-amber-50 text-amber-600",
  overviewIconViolet: "bg-violet-50 text-violet-600",
  overviewLabel: "text-xs font-medium text-slate-500",
  overviewValue: "text-xl font-bold tabular-nums tracking-tight text-slate-900",
  overviewMeta: "text-[11px] text-slate-500",

  // ----- Search & Filter Toolbar -----
  toolbar:
    "mb-4 flex flex-col gap-3 lg:flex-row lg:items-center",
  searchCard:
    "relative flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100",
  searchIcon: "ml-2 h-4 w-4 shrink-0 text-slate-400",
  searchInput:
    "w-full min-w-0 bg-transparent px-2 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none",
  searchClear:
    "mr-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  filterWrap: "relative shrink-0",
  filterButton:
    "flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 lg:w-auto",
  filterIcon: "h-4 w-4 shrink-0 text-slate-500",
  filterChevron: "h-4 w-4 shrink-0 text-slate-400",
  filterMenu:
    "absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg",
  filterOption:
    "block w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none",
  filterOptionActive: "bg-indigo-50 font-semibold text-indigo-700",
  sortWrap: "relative shrink-0",
  sortLabel: "sr-only",
  sortSelect:
    "h-full w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  sortIcon:
    "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500",
  sortChevron:
    "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400",
  resultCount: "mb-4 text-sm text-slate-500",

  // ----- Toast (top-right, same placement as the dashboard toast) -----
  toastContainer: "fixed right-4 top-20 z-50 w-full max-w-sm px-4",
  toastInner: "flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg",
  toastSuccess: "border-emerald-200",
  toastError: "border-red-200",
  toastIconSuccess: "h-5 w-5 shrink-0 text-emerald-600",
  toastIconError: "h-5 w-5 shrink-0 text-red-600",
  toastMessage: "break-words font-medium text-slate-800",
  toastClose:
    "ml-auto shrink-0 rounded text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",

  // ----- Loading -----
  loadingGrid: "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3",
  loadingCard: `${CARD_BASE} p-6`,
  skeletonLine: "animate-pulse rounded-lg bg-slate-200",

  // ----- Error (same card shape/tone as the quiz-detail error) -----
  errorCard:
    "rounded-2xl border border-red-200 bg-red-50 p-8 text-center",
  errorTitle: "text-lg font-semibold text-red-800",
  errorText: "mt-2 text-sm text-red-700",
  errorRetry:
    "mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400",

  // ----- Grid & Cards -----
  grid: "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3",
  cardGroup: "flex",
  // This exact class is asserted by the admin experience harness, so it must
  // stay on the card element by itself (no extra classes appended).
  card: "group flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
  cardAccent: "h-1.5 w-full bg-gradient-to-r",
  cardHeader: "relative border-b border-slate-100 bg-white p-4",
  cardHeaderInner:
    "flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center",
  cardHeaderLeft: "flex min-w-0 items-center gap-3",
  iconWrapper:
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
  techName: "min-w-0 break-words text-lg font-bold text-slate-900",
  cardMeta: "mt-0.5 text-xs text-slate-500",

  // Level badge (base classes; tints come from getLevelColor)
  levelBadgeBase:
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",

  // Compact metadata strip (keeps cards short and scannable)
  cardBody: "flex flex-1 flex-col p-4",
  cardBodyContent: "flex flex-1 flex-col justify-between gap-4",
  metaRow: "flex flex-wrap items-center gap-x-4 gap-y-2",
  metaItem: "inline-flex min-w-0 items-center gap-1.5 text-xs text-slate-600",
  metaIcon: "h-3.5 w-3.5 shrink-0 text-slate-400",
  metaValue: "truncate font-semibold text-slate-800",

  // Card footer
  cardFooter:
    "mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4",
  cardFooterActions: "flex items-center gap-2",
  viewButton:
    "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
  viewIcon: "h-4 w-4",
  duplicateButton:
    "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  duplicateIcon: "h-4 w-4",
  deleteButton:
    "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
  trashIcon: "h-4 w-4",
  deleteText: "font-medium",

  // ----- Empty / no-match states -----
  emptyContainer: `${CARD_BASE} p-10 text-center`,
  emptyIconBox:
    "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50",
  emptyIcon: "h-8 w-8 text-indigo-500",
  emptyTitle: "mb-2 text-xl font-bold text-slate-800",
  emptyText: "mx-auto mb-6 max-w-md text-slate-600",
  emptyButton:
    "inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
  emptyButtonIcon: "h-4 w-4",
  emptyButtonText: "font-semibold",
  clearFiltersButton:
    "mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",

  // ----- Delete confirmation -----
  modalOverlay:
    "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm",
  modalCard:
    "w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl",
  modalIconBox:
    "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600",
  modalIcon: "h-6 w-6",
  modalTitle: "mb-2 text-center text-lg font-semibold text-slate-800",
  modalText: "mb-6 text-center text-sm text-slate-600",
  modalName: "break-words font-semibold text-red-600",
  modalActions: "flex justify-end gap-3",
  modalCancel:
    "rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  modalDelete:
    "rounded-xl bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2",
};

// ==================== Quiz Detail (/quiz/:id) Styles ====================
export const quizDetailStyles = {
  page: "min-h-screen bg-slate-50 p-4 md:p-8",
  container: "mx-auto max-w-3xl",
  backLink:
    "mb-6 inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  backIcon: "h-4 w-4",
  card: `${CARD_BASE} p-6 md:p-8`,
  headerRow:
    "flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5",
  titleWrap: "min-w-0",
  eyebrow:
    "text-xs font-semibold uppercase tracking-wider text-slate-500",
  title: "mt-1 break-words text-2xl font-bold tracking-tight text-slate-900",
  levelBadge:
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
  statusPill:
    "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100",
  statusDot: "h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500",
  subtitle: "mt-3 max-w-2xl text-sm text-slate-600",
  metaGrid: "mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3",
  metaCard:
    "rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition-colors hover:bg-white",
  metaIconBox:
    "mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200",
  metaIcon: "h-4 w-4",
  metaLabel: "text-xs font-medium text-slate-500",
  metaValue: "mt-1 break-words text-lg font-bold tabular-nums text-slate-900",
  idRow:
    "mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2",
  idLabel: "text-xs font-semibold uppercase tracking-wider text-slate-400",
  idValue:
    "min-w-0 flex-1 truncate font-mono text-xs text-slate-600",
  idCopy:
    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  idCopyIcon: "h-3.5 w-3.5",
  noticeCard:
    "mt-5 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4",
  noticeIcon: "mt-0.5 h-4 w-4 shrink-0 text-indigo-600",
  noticeText: "text-sm text-slate-700",
  loadingWrap: "space-y-4",
  skeletonLine: "animate-pulse rounded-lg bg-slate-200",
  errorCard: "rounded-2xl border border-red-200 bg-red-50 p-8 text-center",
  errorTitle: "text-lg font-semibold text-red-800",
  errorText: "mt-2 break-words text-sm text-red-700",
  retryButton:
    "mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400",
  actions: "mt-6 flex flex-wrap gap-3",
  listButton:
    "inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
  secondaryButton:
    "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60",
  secondaryIcon: "h-4 w-4",
  copiedIcon: "h-4 w-4 text-emerald-600",
};
