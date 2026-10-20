import { ChevronRight } from "lucide-react";
import Card from "../ui/Card.jsx";
import { sidebarStyles } from "../../assets/dummyStyles (1).js";

// Difficulty selection for the chosen technology. Every figure on a level
// card comes from the loaded catalog or the local progress record: question
// counts and time limits from the catalog, answered/completed pills from
// saved answers. A level with zero questions is shown as unavailable and
// cannot be started.
const TechSelectedState = ({
  selectedTechObj,
  selectedTech,
  getLevelsForTech,
  getProgressForTechLevel,
  isTechLevelCompleted,
  handleLevelSelect,
}) => {
  const levels = getLevelsForTech(selectedTech);

  return (
    <div className={sidebarStyles.techSelectedState}>
      <Card className={sidebarStyles.techSelectedCard}>
        <div
          className={`${sidebarStyles.techSelectedIcon} ${selectedTechObj?.color || ""}`}
          aria-hidden="true"
        >
          {(() => {
            const Icon = selectedTechObj?.icon;
            return Icon ? <Icon size={28} /> : null;
          })()}
        </div>
        <h2 className={sidebarStyles.techSelectedTitle}>
          {selectedTechObj?.name?.charAt(0).toUpperCase() +
            selectedTechObj?.name?.slice(1)}{" "}
          Quiz
        </h2>
        <p className={sidebarStyles.techSelectedSubtitle}>
          Select a difficulty level to begin your challenge
        </p>

        <div
          className={sidebarStyles.levelCardGrid}
          role="group"
          aria-label="Difficulty levels"
        >
          {levels.map((level) => {
            const unavailable = level.questions === 0;
            const progress = getProgressForTechLevel(selectedTech, level.id);
            const isCompleted = isTechLevelCompleted(selectedTech, level.id);

            return (
              <button
                type="button"
                key={level.id}
                onClick={() => !unavailable && handleLevelSelect(level.id)}
                disabled={unavailable}
                aria-disabled={unavailable || undefined}
                className={`${sidebarStyles.levelCard} ${
                  unavailable
                    ? sidebarStyles.levelCardUnavailable
                    : sidebarStyles.levelCardAvailable
                }`}
              >
                <div className={sidebarStyles.levelCardTop}>
                  <div className={sidebarStyles.levelCardLeft}>
                    <div
                      className={`${sidebarStyles.levelCardIcon} ${
                        unavailable
                          ? sidebarStyles.levelIconTileUnavailable
                          : sidebarStyles.levelCardIconUnselected
                      }`}
                    >
                      {level.icon}
                    </div>
                    <span
                      className={`${sidebarStyles.levelCardName} ${
                        unavailable ? sidebarStyles.levelNameUnavailable : ""
                      }`}
                    >
                      {level.name}
                    </span>
                  </div>
                  {!unavailable && (
                    <span
                      className={sidebarStyles.levelCardChevron}
                      aria-hidden="true"
                    >
                      <ChevronRight size={18} />
                    </span>
                  )}
                </div>

                <div className={sidebarStyles.levelCardMeta}>
                  <span
                    className={`${sidebarStyles.pill} ${
                      unavailable ? sidebarStyles.pillUnavailable : ""
                    }`}
                  >
                    {unavailable
                      ? "No questions yet"
                      : `${level.questions} Qs`}
                  </span>

                  {!unavailable && level.time && (
                    <span
                      className={`${sidebarStyles.pill} ${sidebarStyles.pillTime}`}
                    >
                      {level.time}
                    </span>
                  )}

                  {!unavailable && progress.answered > 0 && (
                    <span
                      className={`${sidebarStyles.pill} ${sidebarStyles.pillAnswered}`}
                    >
                      {progress.answered}/{progress.total} answered
                    </span>
                  )}

                  {!unavailable && isCompleted && (
                    <span
                      className={`${sidebarStyles.pill} ${sidebarStyles.pillCompleted}`}
                    >
                      Completed
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className={sidebarStyles.readyMessage}>
          <p className={sidebarStyles.readyText}>
            Get ready to test your{" "}
            {selectedTechObj?.name?.charAt(0).toUpperCase() +
              selectedTechObj?.name?.slice(1)}{" "}
            knowledge!
          </p>
        </div>
      </Card>
    </div>
  );
};

export default TechSelectedState;
