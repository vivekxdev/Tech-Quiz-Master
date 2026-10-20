// Flat tinted surfaces (no gradients): colour is a secondary signal only —
// every badge also ships a text label and an icon.
export const getPerformanceStatus = (score) => {
  if (!score) {
    return {
      text: "Score unavailable",
      color: "border-line bg-surface-2",
      iconKey: "scoreUnavailable",
      textColor: "text-ink-2",
    };
  }
  if (score.percentage >= 90)
    return {
      text: "Outstanding!",
      color: "border-amber-200 bg-amber-50",
      iconKey: "outstanding",
      textColor: "text-amber-800",
    };
  if (score.percentage >= 75)
    return {
      text: "Excellent!",
      color: "border-brand-200 bg-brand-50",
      iconKey: "excellent",
      textColor: "text-brand-800",
    };
  if (score.percentage >= 60)
    return {
      text: "Good Job!",
      color: "border-emerald-200 bg-emerald-50",
      iconKey: "goodJob",
      textColor: "text-emerald-800",
    };
  return {
    text: "Keep Practicing",
    color: "border-line bg-surface-2",
    iconKey: "keepPracticing",
    textColor: "text-ink-2",
  };
};
