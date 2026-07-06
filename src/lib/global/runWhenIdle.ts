/**
 * Runs work after the browser is idle (or after a timeout) so first paint stays responsive.
 */
export function runWhenIdle(
  task: () => void,
  options?: { timeoutMs?: number; fallbackDelayMs?: number }
): () => void {
  const timeoutMs = options?.timeoutMs ?? 8000;
  const fallbackDelayMs = options?.fallbackDelayMs ?? 3000;

  if (typeof window === "undefined") {
    task();
    return () => undefined;
  }

  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(() => task(), { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }

  const timerId = window.setTimeout(task, fallbackDelayMs);
  return () => window.clearTimeout(timerId);
}
