const { createHash } = require("node:crypto");

const blank = (status = "unconfigured") => ({
  status,
  provider: "openrouter",
  safeKeyAlias: null,
  limitUsd: null,
  remainingUsd: null,
  usedUsdThisPeriod: null,
  resetCadence: "unknown",
  resetAt: null,
  accountCreditsRemainingUsd: null,
  inputTokens: null,
  outputTokens: null,
  tokenMeasurementScope: null,
  dataSource: "none",
  fetchedAt: null,
});
const amount = (value) =>
  value == null
    ? null
    : typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : (() => {
          throw new Error("Invalid amount");
        })();
// OpenRouter key spend windows use UTC calendar boundaries, not elapsed time.
function nextReset(cadence, now) {
  const date = new Date(now);
  const year = date.getUTCFullYear(),
    month = date.getUTCMonth(),
    day = date.getUTCDate();
  if (cadence === "daily")
    return new Date(Date.UTC(year, month, day + 1)).toISOString();
  if (cadence === "weekly")
    return new Date(
      Date.UTC(year, month, day + (7 - ((date.getUTCDay() + 6) % 7))),
    ).toISOString();
  if (cadence === "monthly")
    return new Date(Date.UTC(year, month + 1, 1)).toISOString();
  return null;
}
function normalize(data, alias, now) {
  if (
    !data ||
    Array.isArray(data) ||
    typeof data !== "object" ||
    !Object.hasOwn(data, "limit")
  )
    throw new Error("Invalid response");
  const limit = amount(data.limit),
    remaining = amount(data.limit_remaining);
  if (remaining !== null && (limit === null || remaining > limit))
    throw new Error("Inconsistent allowance");
  const cadence =
    data.limit_reset === null
      ? "none"
      : ["daily", "weekly", "monthly"].includes(data.limit_reset)
        ? data.limit_reset
        : "unknown";
  const period = cadence === "none" ? "usage" : `usage_${cadence}`;
  return {
    ...blank("ready"),
    safeKeyAlias: alias,
    limitUsd: limit,
    remainingUsd: remaining,
    usedUsdThisPeriod: amount(data[period]),
    resetCadence: cadence,
    resetAt: limit === null ? null : nextReset(cadence, now),
    dataSource: "current_key",
    fetchedAt: new Date(now).toISOString(),
  };
}
const identity = (key) => createHash("sha256").update(key).digest("hex");

// Main-process only. No provider labels, raw bodies, errors or credentials leave it.
class OpenRouterUsageService {
  constructor({
    credentials,
    registry,
    fetchImpl = fetch,
    now = Date.now,
    timeoutMs = 10000,
  }) {
    Object.assign(this, {
      credentials,
      registry,
      fetch: fetchImpl,
      now,
      timeoutMs,
    });
    this.invalidate();
  }
  invalidate() {
    this.generation = (this.generation ?? 0) + 1;
    this.controller?.abort();
    this.keyId = null;
    this.cached = null;
    this.pending = null;
    this.nextAt = 0;
    this.failures = 0;
    this.tokens = null;
  }
  async record(usage, key) {
    // Usage is observed at transport completion, including model checks/repairs.
    if (!key) return;
    if (!this.keyId) this.keyId = identity(key);
    if (identity(key) !== this.keyId) return;
    const input = usage?.promptTokens,
      output = usage?.completionTokens;
    if (
      !Number.isSafeInteger(input) ||
      input < 0 ||
      !Number.isSafeInteger(output) ||
      output < 0
    )
      return;
    this.tokens ??= {
      input: 0,
      output: 0,
      since: new Date(this.now()).toISOString(),
    };
    if (
      !Number.isSafeInteger(this.tokens.input + input) ||
      !Number.isSafeInteger(this.tokens.output + output)
    )
      return;
    this.tokens.input += input;
    this.tokens.output += output;
    // Debounced refresh on next visible request, respecting existing backoff.
    if (!this.failures) this.nextAt = Math.min(this.nextAt, this.now() + 2000);
  }
  withTokens(value) {
    return this.tokens
      ? {
          ...value,
          inputTokens: this.tokens.input,
          outputTokens: this.tokens.output,
          tokenMeasurementScope: `Completed requests on this device since ${this.tokens.since} (current app session; partial/cancelled usage excluded)`,
        }
      : value;
  }
  async get({ refresh = false } = {}) {
    if ((await this.registry.read()).providerId !== "openrouter") {
      if (this.keyId) this.invalidate();
      return { ...blank(), errorMessage: "Select OpenRouter in Settings." };
    }
    let key;
    try {
      key = await this.credentials.get("openrouter");
    } catch {
      this.invalidate();
      return {
        ...blank(),
        errorMessage: "Connect an OpenRouter key in Settings.",
      };
    }
    const id = identity(key);
    if (this.keyId !== id) {
      this.invalidate();
      this.keyId = id;
    }
    if (this.pending) return this.pending;
    if (
      this.cached &&
      (this.now() < this.nextAt ||
        (!refresh &&
          this.cached.status === "ready" &&
          (!this.cached.resetAt ||
            this.now() < Date.parse(this.cached.resetAt)) &&
          this.now() - Date.parse(this.cached.fetchedAt) < 60000))
    )
      return this.withTokens(this.cached);
    const generation = this.generation,
      alias = `Connected key ${id.slice(0, 10)}`;
    this.pending = this.fetchSnapshot(key, alias, generation).finally(() => {
      if (generation === this.generation) this.pending = null;
    });
    return this.pending;
  }
  async fetchSnapshot(key, alias, generation) {
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${key}` },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok)
        throw {
          status: response.status,
          retry: response.headers.get("retry-after"),
        };
      let raw = "",
        bytes = 0;
      for await (const part of response.body) {
        bytes += part.byteLength;
        if (bytes > 65536) throw { malformed: true };
        raw += new TextDecoder().decode(part);
      }
      let value;
      try {
        value = normalize(JSON.parse(raw).data, alias, this.now());
      } catch {
        throw { malformed: true };
      }
      if (
        generation !== this.generation ||
        (await this.registry.read()).providerId !== "openrouter"
      )
        return blank();
      this.cached = value;
      this.failures = 0;
      this.nextAt = this.now() + 5000;
      return this.withTokens(value);
    } catch (error) {
      if (generation !== this.generation) return blank();
      const status =
        error.status === 401 || error.status === 403
          ? "unauthorized"
          : error.status === 404
            ? "unsupported"
            : error.status === 429
              ? "rate_limited"
              : error.malformed
                ? "error"
                : error.status
                  ? "error"
                  : "offline";
      const retry = /^\d+(?:\.\d+)?$/.test(error.retry ?? "")
        ? Number(error.retry) * 1000
        : Date.parse(error.retry) - this.now();
      this.failures++;
      this.nextAt =
        this.now() +
        Math.max(
          Math.min(300000, 5000 * 2 ** Math.min(this.failures - 1, 6)),
          Number.isFinite(retry) ? Math.max(0, retry) : 0,
        );
      const stale =
        this.cached?.fetchedAt &&
        !["unauthorized", "unsupported"].includes(status);
      this.cached = {
        ...(stale ? this.cached : blank(status)),
        status: stale ? "stale" : status,
        errorMessage:
          status === "unauthorized"
            ? "OpenRouter authorization required. Update the key in Settings."
            : status === "rate_limited"
              ? "Rate limited. Refresh will respect the provider retry delay."
              : status === "unsupported"
                ? "Usage endpoint unavailable."
                : status === "error"
                  ? "Usage data unavailable or invalid."
                  : "Offline or timed out. Usage unavailable.",
      };
      return this.withTokens(this.cached);
    } finally {
      clearTimeout(timer);
      await response?.body?.cancel().catch(() => {});
    }
  }
}
module.exports = { OpenRouterUsageService, normalize, blank };
