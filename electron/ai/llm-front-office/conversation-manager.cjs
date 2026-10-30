/** Purpose: explicit context-free schemas within the existing conversation/run stores.
 * Inputs: stored experiment records; outputs: validated copies/paired successful messages.
 * Dependencies: boundary schemas. Failure: invalid identity/provenance rejected.
 * Knobs: none; no second conversation database. Owner: backend. */
const {
  z,
  parse,
  conversationSchema,
  id,
  modelId,
  provider,
  validateConfig,
} = require("./experiment-contracts.cjs");
const { validateTrace } = require("./contracts.cjs");
const { ModelRuntimeError } = require("../model-errors.cjs");

/** Validate mode isolation, unique identities and successful answer-to-attempt relationships. */
function validateExperimentalConversation(value) {
  const v = parse(conversationSchema, value, "MODEL_STORAGE_INVALID");
  if (
    new Set(v.messages.map((m) => m.id)).size !== v.messages.length ||
    new Set(v.attempts.map((a) => a.requestId)).size !== v.attempts.length ||
    new Set(v.attempts.map((a) => a.runId)).size !== v.attempts.length ||
    v.messages.some((m) => m.conversationId !== v.id) ||
    v.attempts.some(
      (a) =>
        !v.messages.some((m) => m.id === a.userMessageId && m.role === "user"),
    ) ||
    v.messages
      .filter((m) => m.role === "assistant")
      .some(
        (m) =>
          !v.attempts.some(
            (a) =>
              a.runId === m.runId &&
              a.userMessageId === m.userMessageId &&
              a.status === "succeeded",
          ),
      )
  )
    throw new ModelRuntimeError(
      "MODEL_STORAGE_INVALID",
      "Invalid experimental conversation relationships.",
    );
  return v;
}
const runSchema = z
  .object({
    schemaVersion: z.literal(3),
    mode: z.literal("front-office"),
    runId: id,
    conversationId: id,
    requestId: id,
    status: z.enum(["succeeded", "failed", "cancelled"]),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    durationMs: z.number().finite().nonnegative(),
    provider: z.union([provider, z.literal("unknown")]),
    model: modelId,
    userMessage: z.string().min(1).max(200000),
    response: z.string().nullable(),
    finishReason: z.string().max(100).nullable(),
    usage: z
      .object({
        promptTokens: z.number().int().nonnegative().nullable(),
        completionTokens: z.number().int().nonnegative().nullable(),
        totalDurationNs: z.number().nonnegative().nullable(),
      })
      .nullable(),
    error: z
      .object({
        code: z.string().max(80),
        message: z.string().max(1000),
        details: z.record(z.string(), z.unknown()),
      })
      .nullable(),
    settings: z.unknown(),
    diagnostics: z
      .object({
        frontOffice: z.unknown(),
        validation: z
          .object({
            valid: z.boolean(),
            format: z.enum(["text", "json"]),
            reason: z.string().nullable().optional(),
          })
          .nullable(),
        attempts: z.array(
          z.object({
            index: z.number().int().positive(),
            deploymentId: z.string().max(240),
            fallback: z.boolean(),
            errorCode: z.string().nullable(),
          }),
        ),
        transport: z.enum(["direct", "litellm"]),
        reasoningTokens: z.number().int().nonnegative().nullable(),
        debug: z
          .object({
            messages: z
              .array(
                z
                  .object({
                    role: z.enum(["user", "assistant"]),
                    content: z.string().max(2000000),
                  })
                  .strict(),
              )
              .max(128)
              .optional(),
            response: z.string().max(2000000).nullable().optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
/** Experimental runs have no scope, agent or source fields; ordinary run schemas stay separate. */
function validateExperimentalRun(value) {
  const v = parse(runSchema, value, "MODEL_RUN_RECORD_INVALID");
  v.settings = validateConfig(v.settings);
  v.diagnostics.frontOffice = validateTrace(v.diagnostics.frontOffice);
  if (
    v.diagnostics.frontOffice.mode !== "experiment" ||
    v.diagnostics.frontOffice.runId !== v.runId ||
    v.diagnostics.frontOffice.requestId !== v.requestId ||
    Date.parse(v.completedAt) < Date.parse(v.startedAt) ||
    (v.status === "succeeded"
      ? !v.response || v.error !== null || !v.finishReason
      : v.response !== null || v.error === null)
  )
    throw new ModelRuntimeError(
      "MODEL_RUN_RECORD_INVALID",
      "Experimental run status/identity does not match its contents.",
    );
  return v;
}
module.exports = { validateExperimentalConversation, validateExperimentalRun };
