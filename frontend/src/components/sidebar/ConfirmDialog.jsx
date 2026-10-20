import React, { useEffect, useRef } from "react";
import { AlertCircle, HelpCircle, Info } from "lucide-react";
import Button from "../ui/Button.jsx";
import { dialogStyles } from "../../assets/dummyStyles (1).js";

const toneStyles = {
  warning: {
    icon: "bg-amber-50 text-amber-700",
    Icon: HelpCircle,
    confirm: "primary",
  },
  danger: {
    icon: "bg-red-50 text-red-700",
    Icon: AlertCircle,
    confirm: "danger",
  },
  info: {
    icon: "bg-sky-50 text-sky-700",
    Icon: Info,
    confirm: "primary",
  },
};

const ConfirmDialog = ({
  tone,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  // Optional in-flight state: the confirm button disables itself and swaps to
  // `busyLabel` while a request is running (driven by useQuizSubmission).
  busy = false,
  busyLabel = "Submitting…",
}) => {
  const styles = toneStyles[tone] || toneStyles.info;
  const panelRef = useRef(null);
  // Pure: derived from the (stable) title, so re-renders keep the same id.
  const titleId = `confirm-dialog-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;

  // Escape dismisses; focus lands on the safe action (Cancel) so a stray
  // Enter can never destroy progress.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector("button")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const { Icon } = styles;

  return (
    <div
      className={dialogStyles.overlay}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = panelRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {/* BACKDROP */}
      <div
        className={dialogStyles.backdrop}
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* MODAL */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={dialogStyles.panel}
      >
        <div className={dialogStyles.body}>
          <span
            className={`${dialogStyles.icon} ${styles.icon}`}
            aria-hidden="true"
          >
            <Icon size={20} />
          </span>
          <div className={dialogStyles.text}>
            <h3 id={titleId} className={dialogStyles.title}>
              {title}
            </h3>
            <p className={dialogStyles.message}>{body}</p>
          </div>
        </div>

        <div className={dialogStyles.actions}>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={styles.confirm}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
