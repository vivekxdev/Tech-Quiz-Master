import { ArrowRight, Clock, HelpCircle } from "lucide-react";
import Button from "../ui/Button.jsx";
import {
  sidebarStyles,
  dashboardStyles,
} from "../../assets/dummyStyles (1).js";
import { formatElapsedTime } from "../../utils/timeFormat.js";

/**
 * Dashboard section surfacing every genuinely resumable saved attempt across
 * techs and levels. "Continue" only selects that tech+level, landing on the
 * existing start screen where the unchanged Resume Quiz / Start New Quiz
 * choice is offered — nothing is resumed, replaced or discarded from here.
 * Items come from real localStorage progress (Sidebar derives them via
 * getAttemptStatus), so the section renders nothing when there is nothing to
 * continue.
 */
const ContinueLearning = ({ items, onContinue }) => (
  <section
    className={dashboardStyles.section}
    aria-labelledby="continue-learning-heading"
  >
    <div className={dashboardStyles.sectionHeader}>
      <h2 id="continue-learning-heading" className={dashboardStyles.sectionTitle}>
        <span className={dashboardStyles.sectionAccent} aria-hidden="true" />
        Continue learning
      </h2>
      <span className={dashboardStyles.sectionCount}>
        {items.length} in progress
      </span>
    </div>

    <div className={dashboardStyles.continueGrid}>
      {items.map((item) => {
        const Icon = item.icon || HelpCircle;
        const percent =
          item.total > 0
            ? Math.min(Math.round((item.answered / item.total) * 100), 100)
            : null;

        return (
          <article
            key={`${item.techId}-${item.levelId}`}
            className={dashboardStyles.continueCard}
          >
            <div className={dashboardStyles.continueTop}>
              <div
                className={`${dashboardStyles.continueIcon} ${item.scheme?.color || ""}`}
              >
                <Icon size={18} aria-hidden="true" />
              </div>
              <div className={dashboardStyles.continueText}>
                <h3 className={dashboardStyles.continueTitle}>{item.techName}</h3>
                <p className={dashboardStyles.continueMeta}>
                  {item.levelName} level
                </p>
              </div>
            </div>

            <div className={dashboardStyles.continueStats}>
              <span className={sidebarStyles.pill}>
                {item.answered}/{item.total > 0 ? item.total : "?"} answered
              </span>
              {item.elapsedSeconds > 0 && (
                <span
                  className={`${sidebarStyles.pill} ${sidebarStyles.pillTime}`}
                >
                  <Clock size={12} aria-hidden="true" />
                  {formatElapsedTime(item.elapsedSeconds)} elapsed
                </span>
              )}
            </div>

            {percent !== null && (
              <div
                className={dashboardStyles.continueProgressTrack}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={`Saved answers for ${item.techName} ${item.levelName}`}
              >
                <div
                  className={dashboardStyles.continueProgressFill}
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}

            <div className={dashboardStyles.continueFooter}>
              <span className={dashboardStyles.continueMeta}>
                Saved on this device
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => onContinue(item.techId, item.levelId)}
                aria-label={`Continue ${item.techName} ${item.levelName} attempt`}
              >
                <span>Continue</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  </section>
);

export default ContinueLearning;
