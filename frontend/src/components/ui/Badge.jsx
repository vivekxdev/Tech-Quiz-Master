import React from "react";

/**
 * Status pill. Tone carries meaning; callers must still ship a text label so
 * colour is never the only signal.
 */
const tones = {
  neutral: "bg-surface-3 text-ink-2 border-line-strong",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-800 border-red-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
};

const Badge = ({ tone = "neutral", className = "", children, ...rest }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone] || tones.neutral} ${className}`}
    {...rest}
  >
    {children}
  </span>
);

export default Badge;
