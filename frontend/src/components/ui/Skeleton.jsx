import React from "react";

/** Placeholder block used while data is loading. */
const Skeleton = ({ className = "" }) => (
  <div className={`animate-shimmer rounded-lg ${className}`} aria-hidden="true" />
);

export default Skeleton;
