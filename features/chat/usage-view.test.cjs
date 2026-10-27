const test = require("node:test");
const assert = require("node:assert/strict");
const { usageView, resetView } = require("../usage-monitor/usage-view.ts");
test("reset countdown stays pinned to the reported period and never invents availability", () => {
  const snapshot = { resetAt: new Date(90061000).toISOString() };
  assert.equal(resetView(snapshot, 0).label, "Key resets in 1d 01:01:01");
  assert.equal(resetView(snapshot, 90060000).label, "Key resets in 00:00:01");
  assert.equal(resetView(snapshot, 90061000).expired, true);
  assert.equal(
    resetView(snapshot, 90062000).label,
    "Reset reached · checking usage",
  );
  assert.equal(resetView(null, 0).label, "Reset time unavailable");
  assert.equal(
    resetView({ resetCadence: "none" }, 0).label,
    "No scheduled credit reset",
  );
  assert.equal(resetView({ resetAt: "invalid" }, 0).expired, false);
});
test("usage progress handles exact thresholds, zero/unlimited budgets and stale health", () => {
  const snapshot = {
    status: "ready",
    limitUsd: 100,
    remainingUsd: 74.5,
    fetchedAt: new Date(0).toISOString(),
  };
  assert.equal(usageView(snapshot, 0).ratio, 0.255);
  for (const [remainingUsd, tone] of [
    [21, "healthy"],
    [20, "warning"],
    [5, "critical"],
    [0, "critical"],
  ])
    assert.equal(usageView({ ...snapshot, remainingUsd }, 0).tone, tone);
  for (const limitUsd of [0, null]) {
    const view = usageView({ ...snapshot, limitUsd, remainingUsd: 0 }, 0);
    assert.equal(view.ratio, null);
    assert.equal(view.tone, "unknown");
  }
  assert.equal(usageView({ ...snapshot, remainingUsd: null }, 0).ratio, null);
  assert.equal(usageView(snapshot, 90001).tone, "unknown");
  assert.equal(usageView({ ...snapshot, status: "stale" }, 0).tone, "unknown");
  assert.equal(usageView(null, 0).ratio, null);
});
