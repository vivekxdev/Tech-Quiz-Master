import {
  BookOpen,
  CheckCircle,
  Clock,
  Sparkles,
  Star,
  Target,
  Zap,
} from "lucide-react";
import {
  dashboardStyles,
  sidebarStyles,
} from "../../assets/dummyStyles (1).js";
import ContinueLearning from "./ContinueLearning.jsx";
import PerformanceSnapshot from "./PerformanceSnapshot.jsx";

const FEATURES = [
  {
    icon: <Star size={18} aria-hidden="true" />,
    iconTone: "bg-brand-50 text-brand-700 border-brand-200",
    title: "Multiple Technologies",
    items: [
      { dot: "bg-brand-500", label: "HTML & CSS fundamentals" },
      { dot: "bg-sky-500", label: "JavaScript & React" },
      { dot: "bg-ink-4", label: "And many more technologies" },
    ],
  },
  {
    icon: <Zap size={18} aria-hidden="true" />,
    iconTone: "bg-amber-50 text-amber-700 border-amber-200",
    title: "Timed Challenges",
    rows: [
      { name: "Basic", tone: "text-emerald-800", time: "5 minutes" },
      { name: "Intermediate", tone: "text-brand-800", time: "10 minutes" },
      { name: "Advanced", tone: "text-amber-800", time: "15 minutes" },
    ],
  },
  {
    icon: <Target size={18} aria-hidden="true" />,
    iconTone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    title: "Progress Tracking",
    checks: [
      "Auto-save per technology",
      "Track level completion",
      "Detailed performance stats",
    ],
  },
];

/**
 * The dashboard (main region while no technology is selected): welcome hero,
 * real resumable attempts, real performance summary, then the feature cards
 * and CTA. Replaces the old EmptyState in the same Sidebar branch — same
 * route, same "Select a technology" entry point, more product.
 *
 * All data slots are supplied by the Sidebar: continue items come from
 * localStorage progress, performance from the signed-in user's result history.
 * Signed-out users are shown no performance section at all (there is no
 * authenticated history to show).
 */
const DashboardHome = ({
  continueItems,
  onContinue,
  showPerformance,
  performance,
  onRetryPerformance,
}) => (
  <div className={dashboardStyles.container}>
    {/* Welcome hero */}
    <div className={dashboardStyles.hero}>
      <div className={dashboardStyles.heroIcon}>
        <BookOpen size={22} aria-hidden="true" />
      </div>
      <p className={dashboardStyles.heroEyebrow}>Dashboard</p>
      <h2 className={dashboardStyles.heroTitle}>Ready for your next quiz?</h2>
      <p className={dashboardStyles.heroSubtitle}>
        Select a technology from the sidebar to begin your quiz journey
      </p>
    </div>

    {/* Unfinished attempts saved on this device */}
    {continueItems.length > 0 && (
      <ContinueLearning items={continueItems} onContinue={onContinue} />
    )}

    {/* Signed-in performance summary from real result history */}
    {showPerformance && (
      <PerformanceSnapshot
        status={performance.status}
        results={performance.results}
        message={performance.message}
        onRetry={onRetryPerformance}
      />
    )}

    {/* Feature cards */}
    <div className={`${dashboardStyles.section} ${sidebarStyles.featureCardsGrid}`}>
      {FEATURES.map((feature) => (
        <div key={feature.title} className={sidebarStyles.featureCard}>
          <div className={sidebarStyles.featureCardBody}>
            <div
              className={`${sidebarStyles.featureCardIconContainer} ${feature.iconTone}`}
            >
              {feature.icon}
            </div>
            <h3 className={sidebarStyles.featureCardTitle}>{feature.title}</h3>

            {feature.items && (
              <div className={sidebarStyles.featureCardList}>
                {feature.items.map((item) => (
                  <div
                    key={item.label}
                    className={sidebarStyles.featureListItem}
                  >
                    <div
                      className={`${sidebarStyles.listDot} ${item.dot}`}
                      aria-hidden="true"
                    />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            )}

            {feature.rows && (
              <div className="grow space-y-2">
                {feature.rows.map((row) => (
                  <div key={row.name} className={sidebarStyles.levelStatRow}>
                    <span
                      className={`${sidebarStyles.levelStatBadge} ${row.tone}`}
                    >
                      {row.name}
                    </span>
                    <span className={sidebarStyles.levelStatTime}>
                      <Clock
                        size={12}
                        className="mr-1 inline align-[-1px]"
                        aria-hidden="true"
                      />
                      {row.time}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {feature.checks && (
              <div className="grow space-y-2">
                {feature.checks.map((label) => (
                  <div key={label} className={sidebarStyles.featureCheckItem}>
                    <CheckCircle
                      className={sidebarStyles.checkIcon}
                      aria-hidden="true"
                    />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>

    {/* CTA */}
    <div className={sidebarStyles.ctaContainer}>
      <div className={sidebarStyles.ctaText}>
        <div className={sidebarStyles.ctaTextInner}>
          <Sparkles className={sidebarStyles.ctaSparkle} aria-hidden="true" />
          Select any technology to begin!
        </div>
      </div>
    </div>
  </div>
);

export default DashboardHome;
