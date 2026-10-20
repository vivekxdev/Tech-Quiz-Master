import React from "react";

/**
 * Neutral elevated surface used for every panel in the app.
 * `border` intentionally carries no colour so a caller can add exactly one
 * `border-*` token (e.g. `border-brand-200`) without an override conflict.
 */
const Card = ({ className = "", children, ...rest }) => (
  <div
    className={`rounded-card border bg-surface shadow-card ${className}`}
    {...rest}
  >
    {children}
  </div>
);

export default Card;
