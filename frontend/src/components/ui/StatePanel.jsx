import React from "react";

/**
 * Shared shell for empty, error and informational states so every screen
 * presents them identically: icon tile, heading, message, optional actions.
 */
const StatePanel = ({
  icon = null,
  tone = "neutral",
  title,
  message,
  children,
  className = "",
}) => {
  const iconTone = {
    neutral: "bg-surface-3 text-ink-2",
    brand: "bg-brand-50 text-brand-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className={`flex justify-center px-4 py-12 md:py-16 ${className}`}>
      <div className="w-full max-w-md rounded-card border border-line bg-surface px-6 py-8 text-center shadow-card sm:px-8">
        {icon && (
          <div
            className={`mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${iconTone}`}
          >
            {icon}
          </div>
        )}
        <h2 className="text-base font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {message && (
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-2">
            {message}
          </p>
        )}
        {children && <div className="mt-6 flex justify-center">{children}</div>}
      </div>
    </div>
  );
};

export default StatePanel;
