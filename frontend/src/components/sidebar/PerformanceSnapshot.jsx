import { Link } from "react-router-dom";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import Button from "../ui/Button.jsx";
import Skeleton from "../ui/Skeleton.jsx";
import { dashboardStyles } from "../../assets/dummyStyles (1).js";
import {
  summarizePerformance,
  TREND_MINIMUM_ATTEMPTS,
} from "../../utils/performanceSummary.js";

const TREND_TONES = {
  up: "text-success",
  down: "text-danger",
  flat: "text-ink-3",
};

const TREND_ICONS = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

/**
 * Compact performance summary computed with summarizePerformance from the
 * SAME real result rows the My Result page renders, so the dashboard and the
 * history page can never disagree. Attempts / Average / Best always come from
 * scored attempts; the trend line appears only once 6+ scored attempts exist
 * (otherwise it says so instead of guessing). Loading, empty and error states
 * are honest — nothing here is mocked or estimated.
 */
const PerformanceSnapshot = ({ status, results, message, onRetry }) => {
  const summary = summarizePerformance(results);

  return (
    <section
      className={dashboardStyles.section}
      aria-labelledby="performance-heading"
    >
      <div className={dashboardStyles.perfHeader}>
        <h2 id="performance-heading" className={dashboardStyles.perfTitle}>
          <span className={dashboardStyles.sectionAccent} aria-hidden="true" />
          Your performance
        </h2>
        <Link to="/result" className={dashboardStyles.perfLink}>
          View all results
        </Link>
      </div>

      <div className={dashboardStyles.perfCard}>
        {status === "loading" && (
          <div className={dashboardStyles.tilesGrid} aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className={dashboardStyles.skeletonTile} />
            ))}
          </div>
        )}

        {status === "error" && (
          <div className={dashboardStyles.compactPanel} role="status">
            <p className={dashboardStyles.compactTitle}>
              Performance is unavailable right now
            </p>
            <p className={dashboardStyles.compactText}>{message}</p>
            <div className={dashboardStyles.compactActions}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onRetry}
              >
                Try again
              </Button>
            </div>
          </div>
        )}

        {status === "ready" && summary.attempts === 0 && (
          <div className={dashboardStyles.compactPanel}>
            <p className={dashboardStyles.compactTitle}>No attempts yet</p>
            <p className={dashboardStyles.compactText}>
              Complete a quiz and your score, average and best results will
              show up here.
            </p>
          </div>
        )}

        {status === "ready" && summary.attempts > 0 && (
          <>
            <div className={dashboardStyles.tilesGrid}>
              <div className={dashboardStyles.tile}>
                <p className={dashboardStyles.tileLabel}>Attempts</p>
                <p className={dashboardStyles.tileValue}>{summary.attempts}</p>
              </div>
              <div className={dashboardStyles.tile}>
                <p className={dashboardStyles.tileLabel}>Average</p>
                <p className={dashboardStyles.tileValue}>
                  {summary.average}%
                </p>
              </div>
              <div className={dashboardStyles.tile}>
                <p className={dashboardStyles.tileLabel}>Best</p>
                <p className={dashboardStyles.tileValue}>{summary.best}%</p>
              </div>
            </div>

            <div className={dashboardStyles.trendRow}>
              <span className={dashboardStyles.trendLabel}>
                {summary.trend ? "Last 3 vs previous 3" : "Recent trend"}
              </span>
              {summary.trend
                ? (() => {
                    const TrendIcon =
                      TREND_ICONS[summary.trend.direction] || Minus;
                    return (
                      <span
                        className={`${dashboardStyles.trendValue} ${
                          TREND_TONES[summary.trend.direction] || "text-ink-3"
                        }`}
                      >
                        <TrendIcon size={14} aria-hidden="true" />
                        {summary.trend.delta > 0
                          ? `+${summary.trend.delta}`
                          : summary.trend.delta}{" "}
                        pts
                      </span>
                    );
                  })()
                : (
                    <span
                      className={`${dashboardStyles.trendValue} text-ink-3`}
                    >
                      Needs {TREND_MINIMUM_ATTEMPTS}+ attempts
                    </span>
                  )}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default PerformanceSnapshot;
