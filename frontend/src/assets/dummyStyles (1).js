/* ---------------------------------------------------------------------------
 * Design-system style maps.
 *
 * Class strings live here as data so screens stay readable. Visual values are
 * driven by the tokens declared in src/index.css (Tailwind 4 @theme).
 * Screens must not re-declare colours, radii or shadows inline.
 * ------------------------------------------------------------------------- */

/* ==========================================================================
 * Navbar
 * ========================================================================== */
export const navbarStyles = {
  container: "sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-sm",
  nav: "w-full",
  innerContainer:
    "mx-auto flex h-14 w-full max-w-(--breakpoint-2xl) items-center gap-4 px-4 md:px-6",
  flexContainer: "flex w-full items-center justify-between gap-3",

  logoSection: "flex min-w-0 items-center gap-2.5",
  logoButton:
    "flex items-center gap-2.5 rounded-lg transition-opacity duration-150 hover:opacity-80",
  logoImage: "h-8 w-8 shrink-0 object-contain",

  titleContainer: "hidden min-w-0 flex-1 md:block",
  titleWrapper: "min-w-0",
  titleBox: "min-w-0",
  titleText: "truncate text-sm font-semibold tracking-tight text-ink",

  // Auth buttons belong to the wide layout only; below lg the hamburger
  // menu carries the same actions, so rendering both duplicated them.
  desktopButtons: "hidden items-center gap-2 lg:flex",
  buttonBase:
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-surface-2 hover:border-ink-4",
  // Current-page marker for a nav action; always paired with aria-current.
  buttonActive: "border-brand-200 bg-brand-50 text-brand-700",
  // 40px so the touch target clears the comfortable minimum on phones.
  mobileMenuButton:
    "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-2 transition-colors duration-150 hover:bg-surface-2 lg:hidden",
  mobileMenuWrapper:
    "border-t border-line bg-surface px-4 py-3 lg:hidden",

};

/* ==========================================================================
 * My Results page
 * ========================================================================== */
export const getBadgeClasses = (percent) => {
  if (percent >= 85)
    return "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800";
  if (percent >= 65)
    return "inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800";
  if (percent >= 45)
    return "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800";
  return "inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-800";
};

export const getBadgeText = (percent) => {
  if (percent >= 85) return "Excellent";
  if (percent >= 65) return "Good";
  if (percent >= 45) return "Average";
  return "Needs Work";
};

export const getColorClass = (percent) => {
  if (percent >= 85) return "emerald";
  if (percent >= 65) return "brand";
  if (percent >= 45) return "amber";
  return "red";
};

export const colorClasses = {
  emerald: {
    bg: "bg-emerald-500",
    border: "border-emerald-300",
    hoverBorder: "hover:border-emerald-400",
    text: "text-emerald-700",
    iconBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
    statBg: "bg-emerald-50",
    statBorder: "border-emerald-100",
  },
  brand: {
    bg: "bg-brand-500",
    border: "border-brand-300",
    hoverBorder: "hover:border-brand-400",
    text: "text-brand-700",
    iconBg: "bg-brand-50 text-brand-700 border-brand-200",
    statBg: "bg-brand-50",
    statBorder: "border-brand-100",
  },
  amber: {
    bg: "bg-amber-500",
    border: "border-amber-300",
    hoverBorder: "hover:border-amber-400",
    text: "text-amber-700",
    iconBg: "bg-amber-50 text-amber-700 border-amber-200",
    statBg: "bg-amber-50",
    statBorder: "border-amber-100",
  },
  red: {
    bg: "bg-red-500",
    border: "border-red-300",
    hoverBorder: "hover:border-red-400",
    text: "text-red-700",
    iconBg: "bg-red-50 text-red-700 border-red-200",
    statBg: "bg-red-50",
    statBorder: "border-red-100",
  },
};

export const resultPageStyles = {
  container: "min-h-screen bg-canvas pb-14",
  innerContainer: "mx-auto w-full max-w-6xl px-4 py-8 md:px-6 md:py-10",

  header: "mb-8 border-b border-line pb-6 md:mb-10",
  headerBox: "",
  headerTitle:
    "text-2xl font-bold tracking-tight text-ink md:text-3xl",
  headerSubtitle: "mt-1.5 text-sm text-ink-2",

  trackSection: "mb-8 md:mb-10",
  trackHeader: "mb-3 flex items-center justify-between",
  trackTitle:
    "text-[11px] font-semibold uppercase tracking-widest text-ink-3",
  trackAccent: "ml-2 h-3 w-0.5 rounded-full bg-brand-500",

  cardsGrid: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",

  stripCard: (colors) =>
    `group relative overflow-hidden rounded-card border bg-surface shadow-card transition-all duration-200 hover:shadow-raised ${colors.border} ${colors.hoverBorder}`,
  stripCardAccent: (colors) => `h-1 w-full ${colors.bg}`,
  stripCardContent: "p-5",

  stripCardTopRow:
    "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
  stripCardIdentity: "flex min-w-0 items-center gap-3",
  stripCardIconContainer: (colors) =>
    `flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${colors.iconBg}`,
  stripCardIconText: "text-sm font-bold",
  stripCardTitleContainer: "min-w-0 flex-1",
  stripCardTitle: "truncate text-sm font-semibold text-ink",
  stripCardSubtitle: "mt-0.5 text-xs text-ink-3",
  stripCardPercentContainer: "text-left sm:text-right",
  stripCardPercent: (colors) =>
    `text-2xl font-bold tabular-nums leading-none tracking-tight ${colors.text}`,
  stripCardBadgeContainer: "mt-1.5 sm:flex sm:justify-end",

  stripCardStatsRow: "mt-4 grid grid-cols-3 gap-2",
  stripCardStat: (isCorrect, colors) =>
    `rounded-lg border p-3 text-center ${isCorrect ? `${colors.statBg} ${colors.statBorder}` : "border-line bg-surface-2"}`,
  stripCardStatNumber: "text-lg font-bold tabular-nums text-ink",
  stripCardStatLabel: "mt-0.5 text-[11px] text-ink-3",

  stripCardMeta: "mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4",
  stripCardMetaItem: "min-w-0",
  stripCardMetaLabel: "text-[11px] font-medium text-ink-3",
  stripCardMetaValue: "mt-0.5 text-sm font-medium text-ink",
  stripCardReview: "mt-4 w-full",

  /* --- Loading / empty / error states ------------------------------------- */
  loadingWrap: "flex justify-center py-12 md:py-16",
  loadingCard:
    "w-full max-w-md space-y-3 rounded-card border border-line bg-surface p-6 shadow-card",
  loadingGrid: "grid grid-cols-3 gap-2 pt-2",
  startLink:
    "inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-medium tracking-tight text-white transition-colors hover:bg-brand-700",

  /* --- Performance summary (tiles match the Step 6 dashboard) -------------- */
  summarySection: "mb-8 md:mb-10",
  summaryGrid: "mt-3 grid grid-cols-2 gap-3 md:grid-cols-4",
  summaryTile: "rounded-card border border-line bg-surface p-4 shadow-card",
  summaryTileLabel: "text-[11px] font-medium uppercase tracking-wide text-ink-3",
  summaryTileValue: "mt-1 text-xl font-bold tabular-nums tracking-tight",
  summaryTileValueDefault: "text-ink",
  summaryTileValueUp: "text-success",
  summaryTileValueDown: "text-danger",
  summaryTileValueMuted: "text-ink-2",
  summaryTileSub: "mt-0.5 text-xs leading-snug text-ink-3",
};

/* ==========================================================================
 * Historical attempt review dialog (My Result → Review answers)
 * ========================================================================== */
export const reviewStyles = {
  overlay: "fixed inset-0 z-[9999] flex items-center justify-center p-4",
  backdrop: "absolute inset-0 bg-ink/40 backdrop-blur-sm",
  panel:
    "relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-card border border-line bg-surface shadow-overlay",

  header:
    "flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6",
  headerText: "min-w-0 flex-1",
  title: "truncate text-base font-semibold tracking-tight text-ink",
  subtitle: "mt-0.5 text-xs text-ink-3",
  headerStats: "flex shrink-0 flex-wrap items-center gap-3",
  score: "text-sm font-bold tabular-nums text-ink",
  close:
    "rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",

  body: "overflow-y-auto px-5 py-5 sm:px-6",
  legacy:
    "rounded-card border border-line bg-surface-2 px-4 py-6 text-center text-sm leading-relaxed text-ink-2",
  list: "space-y-4",

  question: "rounded-card border border-line bg-surface p-4",
  questionTop: "flex items-start justify-between gap-3",
  questionText: "min-w-0 break-words text-sm font-medium leading-snug text-ink",
  chip:
    "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
  chipUnanswered: "border-line bg-surface-2 text-ink-3",
  chipCorrect: "border-emerald-200 bg-emerald-50 text-emerald-700",
  chipIncorrect: "border-red-200 bg-red-50 text-red-700",

  options: "mt-3 space-y-1.5",
  option:
    "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
  optionCorrect: "border-emerald-200 bg-emerald-50 text-emerald-900",
  optionPicked: "border-red-200 bg-red-50 text-red-900",
  optionIdle: "border-line bg-surface text-ink-2",
  optionText: "min-w-0",
  optionLabel:
    "inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide",

  footer: "flex justify-end border-t border-line px-5 py-4 sm:px-6",
};

/* ==========================================================================
 * Confirmation dialog (submit / restart / start-new / login)
 * Shares the review dialog's overlay/backdrop/panel tokens so every modal in
 * the app is presented identically.
 * ========================================================================== */
export const dialogStyles = {
  overlay: "fixed inset-0 z-[9999] flex items-center justify-center p-4",
  backdrop: "absolute inset-0 bg-ink/40 backdrop-blur-sm",
  panel:
    "relative max-h-[85vh] w-full max-w-md animate-[scaleIn_0.25s_ease] overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-overlay sm:p-7",
  body: "flex items-start gap-3",
  icon: "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
  text: "min-w-0",
  title: "text-base font-semibold tracking-tight text-ink",
  message: "mt-1.5 text-sm leading-relaxed text-ink-2",
  actions:
    "mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end",
};

/* ==========================================================================
 * User dashboard (home region of the Sidebar: welcome, continue, performance)
 * ========================================================================== */
export const dashboardStyles = {
  container: "mx-auto w-full max-w-3xl",

  /* --- Welcome hero ------------------------------------------------------ */
  hero:
    "rounded-card border border-line bg-surface px-6 py-7 text-center shadow-card md:px-8",
  heroIcon:
    "mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700",
  heroEyebrow: "text-[11px] font-semibold uppercase tracking-widest text-brand-600",
  heroTitle: "mt-1.5 text-2xl font-bold tracking-tight text-ink md:text-3xl",
  heroSubtitle:
    "mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-2 md:text-base",

  /* --- Section scaffolding (shared by continue + performance) ------------ */
  section: "mt-6",
  sectionHeader: "mb-3 flex flex-wrap items-center justify-between gap-2",
  sectionTitle:
    "flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3",
  sectionAccent: "h-3 w-0.5 rounded-full bg-brand-500",
  sectionCount:
    "rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-3",

  /* --- Continue learning -------------------------------------------------- */
  continueGrid: "grid grid-cols-1 gap-4 sm:grid-cols-2",
  continueCard:
    "rounded-card border border-line bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-raised",
  continueTop: "flex items-start gap-3",
  continueIcon:
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
  continueText: "min-w-0 flex-1 text-left",
  continueTitle: "truncate text-sm font-semibold text-ink",
  continueMeta: "mt-0.5 text-xs text-ink-3",
  continueStats: "mt-3 flex flex-wrap items-center gap-1.5",
  continueProgressTrack:
    "mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-3",
  continueProgressFill:
    "h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out",
  continueFooter: "mt-4 flex items-center justify-between gap-3",

  /* --- Performance snapshot ---------------------------------------------- */
  perfCard: "rounded-card border border-line bg-surface p-5 shadow-card",
  perfHeader:
    "mb-4 flex flex-wrap items-center justify-between gap-2",
  perfTitle:
    "flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3",
  perfLink:
    "inline-flex h-8 items-center justify-center rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors duration-150 hover:border-ink-4 hover:bg-surface-2",
  tilesGrid: "grid grid-cols-1 gap-2 sm:grid-cols-3",
  tile: "rounded-lg border border-line bg-surface-2 px-3 py-3 text-center",
  tileLabel: "text-[11px] font-medium text-ink-3",
  tileValue:
    "mt-0.5 text-xl font-bold tabular-nums tracking-tight text-ink",
  skeletonTile: "h-[3.25rem] w-full",
  trendRow:
    "mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5",
  trendLabel: "text-xs text-ink-3",
  trendValue: "inline-flex items-center gap-1 text-xs font-semibold",

  /* --- Compact honest states (never a second full-screen panel) ----------- */
  compactPanel:
    "rounded-card border border-dashed border-line bg-surface-2 px-4 py-5 text-center",
  compactTitle: "text-sm font-semibold text-ink",
  compactText: "mt-1 text-xs leading-relaxed text-ink-3",
  compactActions: "mt-3 flex justify-center",
};

/* ==========================================================================
 * Quiz shell: sidebar, screens, question flow
 * ========================================================================== */
export const sidebarStyles = {
  /* --- Layout ----------------------------------------------------------- */
  container: "min-h-screen bg-canvas",
  flexContainer:
    "flex min-h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden",
  overlay: "fixed inset-0 z-40 bg-ink/30",

  /* --- Sidebar ---------------------------------------------------------- */
  sidebar:
    "fixed inset-y-0 left-0 z-50 flex h-full w-[17.5rem] shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 lg:shadow-none",
  sidebarOpen: "translate-x-0",
  sidebarClosed: "-translate-x-full",

  sidebarHeader: "shrink-0 border-b border-line px-4 py-3.5",
  headerContent: "flex items-center justify-between gap-2",
  logoContainer: "flex min-w-0 items-center gap-2.5",
  logoIcon:
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700",
  title: "truncate text-[15px] font-semibold leading-tight tracking-tight text-ink",
  subtitle: "text-xs text-ink-3",
  closeButton:
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-surface-3 lg:hidden",

  sidebarContent: "min-h-0 flex-1 overflow-y-auto px-3 py-4",
  techSectionHeader: "mb-3 flex items-center justify-between gap-2",
  techTitle:
    "flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3",
  techTitleAccent: "h-3 w-0.5 rounded-full bg-brand-500",
  techCountBadge:
    "rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-3",

  techButton:
    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-ink transition-[background-color,border-color,box-shadow] duration-150",
  techButtonSelected:
    "border-brand-300 bg-brand-50 text-brand-800 shadow-card ring-1 ring-brand-200",
  techButtonUnselected:
    "border-transparent text-ink hover:border-line hover:bg-surface-2 hover:shadow-card",
  techIconContainer: "flex min-w-0 items-center gap-3",
  techIcon:
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
  techName: "truncate text-sm font-medium",
  // Real completion count for the tech (levels with every question answered).
  techProgressPill:
    "shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-700",
  techChevron: "shrink-0 text-ink-4",

  /* --- Nested level list ------------------------------------------------ */
  levelContainer:
    "ml-5 mt-1.5 space-y-1.5 border-l border-line py-1 pl-3 pr-1",
  levelButton:
    "w-full rounded-lg border bg-surface px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-150",
  levelButtonSelected:
    "border-brand-300 bg-brand-50 shadow-card ring-1 ring-brand-200",
  levelButtonUnselected:
    "hover:border-line-strong hover:bg-surface-2 hover:shadow-card",
  // A level whose catalog entry has zero questions cannot be attempted.
  levelButtonUnavailable:
    "cursor-not-allowed border-dashed border-line bg-surface-2",
  levelRow: "flex items-center justify-between gap-2",
  levelIdentity: "flex min-w-0 items-center gap-2.5",
  levelIconTile: "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
  levelIconTileUnselected: "border-line bg-surface-2 text-ink-2",
  levelIconTileSelected: "border-brand-200 bg-brand-100 text-brand-700",
  levelName: "truncate text-[13px] font-medium text-ink",
  levelMeta: "mt-1.5 flex flex-wrap items-center gap-1.5",
  pill: "inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2",
  pillTime: "border-sky-200 bg-sky-50 text-sky-700",
  pillAnswered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pillCompleted: "border-brand-200 bg-brand-50 text-brand-700",
  pillUnavailable: "border-line bg-surface text-ink-4",
  levelNameUnavailable: "text-ink-4",
  levelIconTileUnavailable: "border-line bg-surface text-ink-4",

  /* --- Sidebar footer --------------------------------------------------- */
  sidebarFooter:
    "shrink-0 border-t border-line bg-surface px-4 py-3",
  footerTextContainer: "space-y-0.5 text-center",
  footerText1: "text-xs font-medium text-ink-2",
  footerText2: "text-[11px] text-ink-4",

  /* --- Main region ------------------------------------------------------ */
  mainContent:
    "min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-6 md:py-8 lg:px-8",
  mobileHeader: "mb-4 flex items-center justify-between",
  hamburgerButton:
    "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-2 transition-colors duration-150 hover:bg-surface-2 lg:hidden",

  /* --- Dashboard feature cards + CTA -------------------------------------- */
  featureCardsGrid:
    "mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",

  featureCard:
    "rounded-card border border-line bg-surface p-5 shadow-card transition-shadow duration-200 hover:shadow-raised",
  featureCardBody: "flex h-full flex-col",
  featureCardIconContainer:
    "mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border",
  featureCardTitle: "mb-2 text-sm font-semibold text-ink",
  featureCardList: "flex-grow space-y-2",
  featureListItem: "flex items-start gap-2 text-[13px] leading-snug text-ink-2",
  listDot: "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-4",

  levelStatRow:
    "flex items-center justify-between rounded-md border border-line bg-surface-2 px-2.5 py-1.5",
  levelStatBadge: "text-[13px] font-medium text-ink",
  levelStatTime: "text-xs text-ink-3",
  featureCheckItem: "flex items-start gap-2 text-[13px] leading-snug text-ink-2",
  checkIcon: "mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600",

  ctaContainer:
    "rounded-card border border-brand-200 bg-brand-50 px-4 py-3",
  ctaText: "flex items-center justify-center",
  ctaTextInner:
    "flex items-center gap-2 text-sm font-medium text-brand-800",
  ctaSparkle: "h-4 w-4 shrink-0 text-brand-600",

  /* --- Tech selected, no level (difficulty selection) --------------------- */
  techSelectedState: "flex items-center justify-center py-2 md:py-6",
  techSelectedCard: "w-full max-w-xl px-6 py-8 text-center md:px-8",
  techSelectedIcon:
    "mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border",
  techSelectedTitle: "text-xl font-bold tracking-tight text-ink md:text-2xl",
  techSelectedSubtitle: "mt-1.5 text-sm text-ink-2",

  levelCardGrid: "mt-6 grid grid-cols-1 gap-3 text-left",
  levelCard:
    "w-full rounded-card border bg-surface p-4 text-left transition-[background-color,border-color,box-shadow] duration-150",
  levelCardSelected:
    "border-brand-300 bg-brand-50 shadow-card ring-1 ring-brand-200",
  levelCardAvailable:
    "hover:border-line-strong hover:bg-surface-2 hover:shadow-card",
  levelCardUnavailable: "cursor-not-allowed border-dashed bg-surface-2",
  levelCardTop: "flex items-center justify-between gap-3",
  levelCardLeft: "flex min-w-0 items-center gap-3",
  levelCardIcon:
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
  levelCardIconSelected: "border-brand-200 bg-brand-100 text-brand-700",
  levelCardIconUnselected: "border-line bg-surface-2 text-ink-2",
  levelCardName: "text-sm font-semibold text-ink",
  levelCardChevron: "shrink-0 text-ink-4",
  levelCardMeta: "mt-3 flex flex-wrap items-center gap-1.5",

  readyMessage: "mt-5 rounded-lg border border-line bg-surface-2 px-3 py-2.5",
  readyText: "text-[13px] font-medium text-ink-2",

  /* --- Results screen ---------------------------------------------------- */
  resultsScreen: "flex items-center justify-center py-2 md:py-6",
  resultsCard: "w-full max-w-2xl p-6 md:p-8",
  resultsHeader: "text-center",
  resultsIconContainer:
    "mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border",
  resultsTitle: "text-2xl font-bold tracking-tight text-ink md:text-3xl",
  resultsSubtitle: "mt-1 text-sm text-ink-2",
  performanceBadge:
    "mt-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",

  timeTakenContainer:
    "mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg border border-line bg-surface-2 px-4 py-3",
  timeTakenHeader: "flex items-center gap-2",
  timeTakenIcon: "h-4 w-4 shrink-0 text-ink-3",
  timeTakenText: "text-sm font-medium text-ink",
  timeTakenSubtext: "hidden",

  scoreCardsGrid: "mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3",
  scoreCard: "rounded-card border p-4 text-center",
  scoreCardIconContainer:
    "mx-auto mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg",
  scoreCardNumber: "text-2xl font-bold tabular-nums tracking-tight",
  scoreCardLabel: "mt-0.5 text-xs font-medium",
  // Semantic tone for the three answer-count cards; the visible label text
  // always carries the meaning, colour only reinforces it.
  scoreCardTone: (tone) => {
    if (tone === "success") {
      return {
        card: "border-emerald-200 bg-emerald-50",
        icon: "bg-emerald-100 text-emerald-700",
        number: "text-emerald-700",
        label: "text-emerald-800",
      };
    }
    if (tone === "danger") {
      return {
        card: "border-red-200 bg-red-50",
        icon: "bg-red-100 text-red-700",
        number: "text-red-700",
        label: "text-red-800",
      };
    }
    return {
      card: "border-line bg-surface-2",
      icon: "bg-surface-3 text-ink-2",
      number: "text-ink",
      label: "text-ink-3",
    };
  },

  overallScoreContainer:
    "mt-4 rounded-card border border-line bg-surface-2 px-4 py-4",
  overallScoreHeader: "mb-2 flex items-center justify-between gap-3",
  overallScoreLabel: "text-sm font-semibold text-ink",
  overallScoreValue: "text-sm font-bold tabular-nums text-ink",
  progressBarContainer:
    "h-2 w-full overflow-hidden rounded-full bg-surface-3",
  progressBar: "h-full rounded-full transition-[width] duration-500 ease-out",
  scoreDescription: "mt-2 text-xs text-ink-3",

  resultsButtonsContainer:
    "mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center",

  /* --- Start / resume screen --------------------------------------------- */
  startQuizScreen: "flex items-center justify-center py-2 md:py-6",
  startQuizCard: "w-full max-w-2xl p-6 md:p-8",
  startQuizHeader: "text-center",
  startQuizIconContainer:
    "mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700",
  startQuizTitle: "text-2xl font-bold tracking-tight text-ink md:text-3xl",
  startQuizSubtitle: "mt-1.5 text-sm text-ink-2",

  quizInfoCard:
    "mt-6 rounded-card border border-line bg-surface-2 px-4 py-4 text-left",
  quizInfoHeader:
    "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
  techDisplay: "flex min-w-0 items-center gap-3",
  techDisplayIcon:
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border",
  techDisplayText: "min-w-0",
  techDisplayName: "truncate text-sm font-semibold text-ink",
  techDisplayLevel: "text-xs text-ink-3",
  quizStats: "flex items-center gap-6 sm:justify-end",
  statItem: "text-left sm:text-center",
  statNumber:
    "flex items-center gap-1 text-lg font-bold tabular-nums tracking-tight text-ink",
  statLabel: "text-xs text-ink-3",
  instructionsContainer: "mt-4 border-t border-line pt-4",
  instructionsTitle: "text-[11px] font-semibold uppercase tracking-widest text-ink-3",
  instructionsList: "mt-2 space-y-1.5 text-left text-[13px] text-ink-2",
  instructionItem: "flex items-start gap-2",
  instructionCheck: "mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600",

  progressWarning:
    "mt-5 flex items-start gap-2.5 rounded-card border border-amber-200 bg-amber-50 px-3.5 py-3 text-left",
  warningText: "text-[13px] leading-relaxed text-amber-900",

  signedOutNote:
    "mt-5 flex items-start gap-2.5 rounded-card border border-sky-200 bg-sky-50 px-3.5 py-3 text-left",
  signedOutNoteText: "text-[13px] leading-relaxed text-sky-900",

  startButtonsContainer:
    "mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center",
  startButtonsCaptions:
    "mt-3 flex flex-col items-center gap-1 text-center sm:flex-row sm:justify-center sm:gap-6",
  startButtonCaption: "text-xs text-ink-3",

  /* --- Active quiz -------------------------------------------------------- */
  quizContainer: "mx-auto w-full max-w-3xl pb-6",
  quizHeaderCard:
    "mb-4 rounded-card border border-line-strong bg-surface p-4 shadow-card md:p-5",
  quizHeader:
    "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
  quizTitle: "flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-ink",
  reviewModeBadge:
    "inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700",
  statsGrid: "flex flex-wrap items-center gap-2 sm:justify-end",
  progressList: "w-full",
  progressItem:
    "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5",
  progressText: "text-[13px] font-medium text-emerald-800",

  timerDisplay:
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold shadow-card transition-colors duration-200",
  timerText: "font-mono text-[15px] font-semibold tabular-nums tracking-tight",

  questionBadge:
    "inline-flex items-center rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2",

  mainProgressBarContainer:
    "mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-3",
  mainProgressBar:
    "h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out",

  questionIndicators: "mt-3 flex flex-wrap gap-1.5",
  questionIndicator:
    "flex h-9 min-w-9 items-center justify-center rounded-lg border px-1.5 text-xs font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-400 hover:bg-brand-50 hover:shadow-raised md:h-8 md:min-w-8",
  currentQuestion:
    "ring-2 ring-brand-600 ring-offset-2 ring-offset-surface",

  timeWarning:
    "mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800",

  questionCard:
    "rounded-card border bg-surface p-5 shadow-card transition-colors duration-200 md:p-6",
  questionCardAnswered: "border-brand-200 shadow-raised",
  questionHeader: "mb-4 flex flex-wrap items-start justify-between gap-3",
  questionIconContainer: "flex min-w-0 items-start gap-3.5",
  questionIcon:
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 shadow-card",
  questionEyebrow:
    "mb-1 text-[11px] font-semibold uppercase tracking-widest text-brand-600",
  questionTextContainer:
    "break-words text-base font-semibold leading-snug text-ink md:text-lg",

  optionsHint:
    "mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-ink-3",
  optionsContainer: "mt-4 space-y-2.5",
  optionButton:
    "w-full rounded-xl border-2 p-3.5 text-left shadow-card transition-all duration-150 md:p-4",
  optionButtonHover:
    "cursor-pointer hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/60 hover:shadow-raised",
  optionButtonSelectedHover:
    "cursor-pointer hover:-translate-y-0.5 hover:border-brand-400 hover:bg-brand-100/60",
  optionButtonDisabled: "cursor-default",
  optionContent: "flex items-center gap-3",
  optionRadio:
    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150",
  optionText: "text-sm leading-snug md:text-base",

  explanationContainer:
    "mt-5 rounded-card border border-line bg-surface-2 px-4 py-3.5 text-left",
  explanationHeader: "mb-1.5 flex items-center gap-2",
  explanationIcon: "h-4 w-4 shrink-0 text-ink-3",
  explanationTitle: "text-[11px] font-semibold uppercase tracking-widest text-ink-3",
  explanationContent: "",
  explanationText: "text-sm leading-relaxed text-ink-2",

  navButtonsContainer:
    "mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between",
  navRightContainer: "flex flex-wrap items-center gap-2.5",

  /* --- Loading state ------------------------------------------------------ */
  loadingState: "flex items-center justify-center py-16",
  loadingCard: "w-full max-w-sm px-6 py-8 text-center",
  loadingSpinner:
    "mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-brand-600",
  loadingText: "text-base font-semibold text-ink",
  loadingSubtext: "mt-1 text-sm text-ink-2",
  // Skeleton row shown while the dashboard waits for the first catalog fetch.
  loadingSkeletonGrid: "mx-auto mt-5 grid max-w-xs grid-cols-3 gap-2",
};

/* ==========================================================================
 * Technology + level colour schemes
 * ========================================================================== */
const fallbackScheme = {
  color: "border-line bg-surface-3 text-ink-2",
  iconColor: "text-ink-2",
};

export const colorSchemes = {
  technologies: {
    default: fallbackScheme,
    html: {
      color: "border-rose-200 bg-rose-50 text-rose-600",
      iconColor: "text-rose-500",
    },
    css: {
      color: "border-sky-200 bg-sky-50 text-sky-600",
      iconColor: "text-sky-500",
    },
    javascript: {
      color: "border-amber-200 bg-amber-50 text-amber-700",
      iconColor: "text-amber-600",
    },
    js: {
      color: "border-amber-200 bg-amber-50 text-amber-700",
      iconColor: "text-amber-600",
    },
    react: {
      color: "border-cyan-200 bg-cyan-50 text-cyan-700",
      iconColor: "text-cyan-600",
    },
    node: {
      color: "border-emerald-200 bg-emerald-50 text-emerald-700",
      iconColor: "text-emerald-600",
    },
    mongodb: {
      color: "border-teal-200 bg-teal-50 text-teal-700",
      iconColor: "text-teal-600",
    },
    java: {
      color: "border-orange-200 bg-orange-50 text-orange-700",
      iconColor: "text-orange-600",
    },
    python: {
      color: "border-indigo-200 bg-indigo-50 text-indigo-700",
      iconColor: "text-indigo-600",
    },
    cpp: {
      color: "border-violet-200 bg-violet-50 text-violet-700",
      iconColor: "text-violet-600",
    },
    bootstrap: {
      color: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
      iconColor: "text-fuchsia-600",
    },
  },
  levels: {
    basic: {
      color: "border-emerald-200 bg-emerald-50 text-emerald-700",
      iconColor: "text-emerald-600",
    },
    intermediate: {
      color: "border-brand-200 bg-brand-50 text-brand-700",
      iconColor: "text-brand-600",
    },
    advanced: {
      color: "border-amber-200 bg-amber-50 text-amber-700",
      iconColor: "text-amber-600",
    },
  },
};

/** Safe lookup so an unknown technology never yields `undefined` in the DOM. */
export const getTechScheme = (techId) =>
  colorSchemes.technologies[techId] || fallbackScheme;

/* ==========================================================================
 * State helpers
 * ========================================================================== */

/**
 * Timer pill colour. Colour is never the only signal: the pill always ships a
 * clock icon and a text label, and low time is announced in words too.
 */
export const getTimeColor = (timeLeft, totalTime, isSubmitted, reviewMode) => {
  if (isSubmitted || reviewMode) return "bg-surface-3 text-ink-2";

  const percentage = totalTime ? (timeLeft / totalTime) * 100 : 100;

  if (percentage > 50) return "bg-emerald-50 text-emerald-700";
  if (percentage > 25) return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-800";
};

/** Question-navigator cell colours (see Sidebar for the current-question ring). */
export const getQuestionStatusColor = (status, reviewMode, isAnswered) => {
  if (reviewMode) {
    switch (status) {
      case "correct":
        return {
          bgColor: "border-emerald-300 bg-emerald-50",
          textColor: "text-emerald-700",
        };
      case "incorrect":
        return {
          bgColor: "border-red-300 bg-red-50",
          textColor: "text-red-700",
        };
      case "marked-unattempted":
      case "unattempted":
        return {
          bgColor: "border-amber-300 bg-amber-50",
          textColor: "text-amber-800",
        };
      default:
        return {
          bgColor: "border-line bg-surface",
          textColor: "text-ink-3",
        };
    }
  }

  return isAnswered
    ? { bgColor: "border-brand-300 bg-brand-50", textColor: "text-brand-700" }
    : { bgColor: "border-line bg-surface", textColor: "text-ink-3" };
};

/**
 * Answer-option states. The selected option uses the brand accent — the same
 * "this is chosen" hue as the question navigator, progress fills and every
 * primary action (index.css: single primary accent for selection).
 */
export const getOptionButtonStyle = (isSelected, isCorrect, showFeedback) => {
  if (!showFeedback) {
    if (isSelected) {
      return {
        buttonClass: "border-brand-300 bg-brand-50 ring-1 ring-brand-200",
        textClass: "text-brand-800",
        radioClass: "border-brand-500 bg-brand-600",
      };
    }
    return {
      buttonClass: "border-line bg-surface",
      textClass: "text-ink",
      radioClass: "border-line-strong bg-surface",
    };
  }

  if (isCorrect) {
    return {
      buttonClass: "border-emerald-300 bg-emerald-50",
      textClass: "text-emerald-900",
      radioClass: "border-emerald-600 bg-emerald-600",
    };
  }

  if (isSelected) {
    return {
      buttonClass: "border-red-300 bg-red-50",
      textClass: "text-red-900",
      radioClass: "border-red-500 bg-red-600",
    };
  }

  return {
    buttonClass: "border-line bg-surface",
    textClass: "text-ink-2",
    radioClass: "border-line-strong bg-surface",
  };
};
