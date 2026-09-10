/** Pure countdown helpers. No Foundry globals. */

export function secondsRemaining(deadlineMs, nowMs) {
  if (!deadlineMs) return null;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function formatCountdown(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return null;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
