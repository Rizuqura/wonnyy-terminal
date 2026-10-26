import type { OpenRouterUsageSnapshot } from "../../types/ai";

export function usageView(
  snapshot: OpenRouterUsageSnapshot | null,
  now: number,
) {
  const staleByTime = snapshot?.fetchedAt
    ? now - Date.parse(snapshot.fetchedAt) > 90000
    : false;
  const ready = snapshot?.status === "ready" && !staleByTime;
  const ratio =
    snapshot &&
    snapshot.limitUsd !== null &&
    snapshot.limitUsd > 0 &&
    snapshot.remainingUsd !== null
      ? Math.max(
          0,
          Math.min(
            1,
            (snapshot.limitUsd - snapshot.remainingUsd) / snapshot.limitUsd,
          ),
        )
      : null;
  const tone =
    !ready || ratio === null
      ? "unknown"
      : ratio >= 0.95
        ? "critical"
        : ratio >= 0.8
          ? "warning"
          : "healthy";
  return { staleByTime, ready, ratio, tone };
}
