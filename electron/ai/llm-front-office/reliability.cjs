/** Purpose: sole experiment retry/deadline/circuit owner. Inputs: routing plan and one-call operation.
 * Outputs: result plus bounded attempt metadata. Dependencies: abortable timers.
 * Failure: preserves partial output, refuses auth/invalid-request retries. Knobs: config.reliability. Owner: backend. */
const { setTimeout: delay } = require("node:timers/promises");
const { ModelRuntimeError } = require("../model-errors.cjs");
const RETRYABLE = new Set([
  "REMOTE_TIMEOUT",
  "MODEL_TIMEOUT",
  "REMOTE_SERVER_ERROR",
  "RATE_LIMITED",
  "PROVIDER_OFFLINE",
]);

/** Maintain per-deployment circuit state in memory; no scheduled background work. */
class ReliabilityController {
  constructor(now = Date.now) {
    this.circuits = new Map();
    this.now = now;
  }
  /** Report cooling-down endpoints to the capability router. */
  healthy(id) {
    return (this.circuits.get(id)?.openUntil ?? 0) <= this.now();
  }
  /** Expose bounded non-secret health counters for the model inspector. */
  state(id) {
    return this.circuits.get(id) ?? { failures: 0, openUntil: 0 };
  }
  /** Execute within one cumulative deadline and attempt/token/cost reservation cap. No post-delta retries. */
  async execute(
    plan,
    config,
    operation,
    { signal, onAttempt = () => {} } = {},
  ) {
    const controller = new AbortController();
    const cancel = () =>
      controller.abort(
        signal.reason ??
          new ModelRuntimeError("MODEL_CANCELLED", "Experiment stopped."),
      );
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new ModelRuntimeError(
            "MODEL_TIMEOUT",
            "The total experiment deadline was reached.",
          ),
        ),
      config.reliability.deadlineMs,
    );
    const attempts = [];
    let reservedTokens = 0,
      reservedCost = 0,
      partial = false;
    const candidates = [plan.primary, ...plan.fallback];
    try {
      for (let index = 0; index < config.reliability.maxAttempts; index++) {
        controller.signal.throwIfAborted();
        const candidate = candidates[Math.min(index, candidates.length - 1)];
        if (!this.healthy(candidate.model.deploymentId))
          throw new ModelRuntimeError(
            "MODEL_UNAVAILABLE",
            "The permitted deployment is cooling down; no hidden fallback was used.",
          );
        if (
          (config.budget.maxTotalTokens !== null &&
            reservedTokens + candidate.budget.totalTokens >
              config.budget.maxTotalTokens) ||
          (config.budget.maxEstimatedUsd !== null &&
            (candidate.budget.estimatedCostUsd === null ||
              reservedCost + candidate.budget.estimatedCostUsd >
                config.budget.maxEstimatedUsd))
        )
          throw new ModelRuntimeError(
            "MODEL_CONTEXT_TOO_LARGE",
            "Another attempt would exceed the cumulative estimated token/cost reservation cap.",
          );
        reservedTokens += candidate.budget.totalTokens;
        reservedCost += candidate.budget.estimatedCostUsd ?? 0;
        const attempt = {
          index: index + 1,
          deploymentId: candidate.model.deploymentId,
          fallback:
            candidate.model.deploymentId !== plan.primary.model.deploymentId,
          errorCode: null,
        };
        attempts.push(attempt);
        onAttempt({ ...attempt });
        let abort;
        try {
          const stopped = new Promise((_, reject) => {
            abort = () => reject(controller.signal.reason);
            controller.signal.addEventListener("abort", abort, { once: true });
            if (controller.signal.aborted) abort();
          });
          const result = await Promise.race([
            operation(candidate, controller.signal, () => {
              partial = true;
            }),
            stopped,
          ]);
          controller.signal.throwIfAborted();
          this.circuits.set(candidate.model.deploymentId, {
            failures: 0,
            openUntil: 0,
          });
          return {
            result,
            attempts,
            reservedTokens,
            reservedCostUsd:
              config.budget.maxEstimatedUsd === null ? null : reservedCost,
          };
        } catch (error) {
          if (controller.signal.aborted) throw controller.signal.reason;
          attempt.errorCode = RETRYABLE.has(error.code)
            ? error.code
            : "NON_RETRYABLE";
          if (RETRYABLE.has(error.code)) {
            const previous = this.state(candidate.model.deploymentId);
            const failures = previous.failures + 1;
            this.circuits.set(candidate.model.deploymentId, {
              failures,
              openUntil:
                failures >= config.reliability.circuitThreshold
                  ? this.now() + config.reliability.cooldownMs
                  : 0,
            });
          }
          if (
            !RETRYABLE.has(error.code) ||
            partial ||
            index + 1 >= config.reliability.maxAttempts
          )
            throw error;
          const retryAfter = error.details?.retryAfterSeconds;
          const wait = Math.max(
            config.reliability.backoffMs * 2 ** index,
            Number.isFinite(retryAfter) ? retryAfter * 1000 : 0,
          );
          await delay(wait, undefined, { signal: controller.signal });
        } finally {
          controller.signal.removeEventListener("abort", abort);
        }
      }
    } catch (error) {
      const original = controller.signal.aborted
        ? controller.signal.reason
        : error;
      if (original instanceof ModelRuntimeError) {
        original.frontOfficeAttempts = attempts;
        throw original;
      }
      const safe = new ModelRuntimeError(
        "PROVIDER_ERROR",
        "The experimental request failed. Check provider access and retry explicitly.",
      );
      safe.frontOfficeAttempts = attempts;
      throw safe;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }
}
module.exports = { ReliabilityController };
