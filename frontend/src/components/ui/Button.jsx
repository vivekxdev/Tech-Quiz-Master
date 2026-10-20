import React from "react";

/**
 * Single source of truth for button styling.
 * Variants: primary | secondary | ghost | danger | dangerGhost | dark
 * Sizes:    sm | md | lg
 */
const variants = {
  primary:
    "bg-brand-600 text-white border border-brand-600 hover:bg-brand-700 hover:border-brand-700 active:bg-brand-800 disabled:bg-brand-200 disabled:border-brand-200",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-surface-2 hover:border-ink-4 active:bg-surface-3 disabled:text-ink-4 disabled:bg-surface-2 disabled:border-line",
  ghost:
    "bg-transparent text-ink-2 border border-transparent hover:bg-surface-3 hover:text-ink active:bg-surface-3 disabled:text-ink-4",
  danger:
    "bg-red-600 text-white border border-red-600 hover:bg-red-700 hover:border-red-700 active:bg-red-800 disabled:bg-red-200 disabled:border-red-200",
  dangerGhost:
    "bg-surface text-red-700 border border-red-200 hover:bg-red-50 hover:border-red-300 active:bg-red-100 disabled:text-red-300 disabled:border-red-100",
  dark: "bg-ink text-white border border-ink hover:bg-ink-2 hover:border-ink-2 active:bg-ink disabled:bg-ink-4 disabled:border-ink-4",
};

const sizes = {
  sm: "h-9 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

const Button = ({
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  disabled = false,
  children,
  ...rest
}) => (
  <button
    type={type}
    disabled={disabled}
    className={`inline-flex shrink-0 items-center justify-center rounded-lg font-medium tracking-tight transition-colors duration-150 disabled:cursor-not-allowed ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
    {...rest}
  >
    {children}
  </button>
);

export default Button;
