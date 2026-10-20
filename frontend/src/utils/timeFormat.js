export const formatTime = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total)) return "00:00";
  const mins = Math.floor(Math.max(total, 0) / 60);
  const secs = Math.max(total, 0) % 60;
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

// Elapsed time for display (HH:MM:SS or MM:SS). Non-finite input (a corrupt
// saved record) renders as 00:00 instead of NaN.
export const formatElapsedTime = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total)) return "00:00";
  const safe = Math.max(total, 0);
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours
      .toString()
      .padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};
