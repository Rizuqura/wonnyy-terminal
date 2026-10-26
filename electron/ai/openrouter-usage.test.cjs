const test = require("node:test");
const assert = require("node:assert/strict");
const { OpenRouterUsageService, normalize } = require("./openrouter-usage.cjs");
const data = {
  limit: 100,
  limit_remaining: 74.5,
  limit_reset: "weekly",
  usage_weekly: 25.5,
};
function fixture(fetchImpl) {
  let time = 100000,
    key = "synthetic-A",
    providerId = "openrouter",
    calls = 0;
  const service = new OpenRouterUsageService({
    credentials: {
      get: async () => {
        if (!key) throw Error("No key");
        return key;
      },
    },
    registry: { read: async () => ({ providerId }) },
    now: () => time,
    fetchImpl: async (...args) => {
      calls++;
      return fetchImpl ? fetchImpl(...args) : Response.json({ data });
    },
    timeoutMs: 20,
  });
  return {
    service,
    advance: (n) => (time += n),
    key: (v) => (key = v),
    provider: (v) => (providerId = v),
    calls: () => calls,
  };
}
test("usage normalization preserves unknowns, cadence and zero without invented balances", () => {
  for (const cadence of [
    "daily",
    "weekly",
    "monthly",
    null,
    undefined,
    "yearly",
  ]) {
    const n = normalize(
      { limit: null, limit_remaining: null, limit_reset: cadence },
      "safe",
      0,
    );
    assert.equal(n.remainingUsd, null);
    assert.equal(n.accountCreditsRemainingUsd, null);
    assert.equal(
      n.resetCadence,
      cadence === null
        ? "none"
        : ["daily", "weekly", "monthly"].includes(cadence)
          ? cadence
          : "unknown",
    );
  }
  assert.equal(
    normalize({ limit: 0, limit_remaining: 0 }, "safe", 0).remainingUsd,
    0,
  );
  for (const value of [
    {},
    { limit: -1 },
    { limit: NaN },
    { limit: "100" },
    { limit: 1, limit_remaining: 2 },
    { limit: null, limit_remaining: 1 },
    { limit: 1, usage_weekly: -1, limit_reset: "weekly" },
  ])
    assert.throws(() => normalize(value, "safe", 0));
});
test("usage coalesces requests and throttles refresh, isolating keys/providers and safe fields", async () => {
  const f = fixture();
  const results = await Promise.all([
    f.service.get(),
    f.service.get(),
    f.service.get({ refresh: true }),
  ]);
  assert.equal(f.calls(), 1);
  assert.equal(results[0].remainingUsd, 74.5);
  assert.doesNotMatch(
    JSON.stringify(results),
    /synthetic-A|1000|Authorization/,
  );
  await f.service.get({ refresh: true });
  assert.equal(f.calls(), 1);
  f.advance(5001);
  await f.service.get({ refresh: true });
  assert.equal(f.calls(), 2);
  f.key("synthetic-B");
  const b = await f.service.get();
  assert.notEqual(b.safeKeyAlias, results[0].safeKeyAlias);
  f.provider("gemini");
  assert.equal((await f.service.get()).remainingUsd, null);
  f.provider("openrouter");
  f.key(null);
  assert.equal((await f.service.get()).status, "unconfigured");
});
test("late responses cannot restore a replaced credential or switched provider", async () => {
  let resolve;
  const f = fixture(() => new Promise((r) => (resolve = r)));
  const pending = f.service.get();
  while (!resolve) await new Promise((r) => setImmediate(r));
  f.service.invalidate();
  resolve(Response.json({ data }));
  assert.equal((await pending).remainingUsd, null);
  let release;
  const other = fixture(() => new Promise((r) => (release = r)));
  const result = other.service.get();
  while (!release) await new Promise((r) => setImmediate(r));
  other.provider("ollama");
  release(Response.json({ data }));
  assert.equal((await result).remainingUsd, null);
});
test("401/403/404/429/500 states, Retry-After and exponential retry preserve only safe stale data", async () => {
  for (const [code, status] of [
    [401, "unauthorized"],
    [403, "unauthorized"],
    [404, "unsupported"],
    [429, "rate_limited"],
    [500, "error"],
  ]) {
    let fail = false;
    const f = fixture(() =>
      fail
        ? new Response("secret raw provider error", {
            status: code,
            headers: { "Retry-After": "120" },
          })
        : Response.json({ data }),
    );
    await f.service.get();
    fail = true;
    f.advance(60001);
    const value = await f.service.get();
    assert.equal(
      value.status,
      [401, 403, 404].includes(code) ? status : "stale",
    );
    assert.equal(
      value.remainingUsd,
      [401, 403, 404].includes(code) ? null : 74.5,
    );
    assert.doesNotMatch(JSON.stringify(value), /secret raw|synthetic-A/);
    const calls = f.calls();
    f.advance(30000);
    await f.service.get({ refresh: true });
    assert.equal(f.calls(), calls);
    const fresh = fixture(() => new Response("failure", { status: code }));
    assert.equal((await fresh.service.get()).status, status);
  }
});
test("timeout, malformed amounts and offline failures never invent funds", async () => {
  const timeout = fixture(
    (_url, init) =>
      new Promise((_, reject) =>
        init.signal.addEventListener("abort", () =>
          reject(Error("sensitive failure")),
        ),
      ),
  );
  assert.equal((await timeout.service.get()).status, "offline");
  const malformed = fixture(() => Response.json({ data: { limit: "1000" } }));
  assert.equal((await malformed.service.get()).status, "error");
  const offline = fixture(() => {
    throw Error("sensitive failure");
  });
  assert.equal((await offline.service.get()).remainingUsd, null);
});
test("transient retries use increasing delays, recover, and honor HTTP-date Retry-After", async () => {
  let code = 500;
  const f = fixture(() =>
    code === 200
      ? Response.json({ data })
      : new Response("failure", { status: code }),
  );
  await f.service.get();
  assert.equal(f.calls(), 1);
  f.advance(4999);
  await f.service.get({ refresh: true });
  assert.equal(f.calls(), 1);
  f.advance(1);
  await f.service.get();
  assert.equal(f.calls(), 2);
  f.advance(9999);
  await f.service.get({ refresh: true });
  assert.equal(f.calls(), 2);
  code = 200;
  f.advance(1);
  assert.equal((await f.service.get()).status, "ready");
  const dated = fixture(
    () =>
      new Response("limited", {
        status: 429,
        headers: { "Retry-After": new Date(160000).toUTCString() },
      }),
  );
  await dated.service.get();
  dated.advance(59999);
  await dated.service.get({ refresh: true });
  assert.equal(dated.calls(), 1);
  dated.advance(1);
  await dated.service.get();
  assert.equal(dated.calls(), 2);
});
test("token meter uses actual complete input/output telemetry with explicit local scope", async () => {
  const f = fixture();
  await f.service.get();
  await f.service.record(
    { promptTokens: 99, completionTokens: 12 },
    "synthetic-A",
  );
  await f.service.record(
    { promptTokens: null, completionTokens: 2 },
    "synthetic-A",
  );
  await f.service.record(
    { promptTokens: 999, completionTokens: 99 },
    "synthetic-B",
  );
  const value = await f.service.get();
  assert.equal(value.inputTokens, 99);
  assert.equal(value.outputTokens, 12);
  assert.match(value.tokenMeasurementScope, /this device.*current app session/);
  f.key("synthetic-B");
  assert.equal((await f.service.get()).inputTokens, null);
});
