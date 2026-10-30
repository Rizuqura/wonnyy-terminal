/** Purpose: experiment boundary schemas. Inputs: IPC/config/storage; outputs: validated copies.
 * Dependencies: existing Zod/parser. Failure: safe MODEL_INVALID_REQUEST. Knobs: defaults.json. Owner: backend. */
const { z, parse } = require("../schemas.cjs");
const defaults = require("./config/defaults.json");
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const modelId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^~?[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
  .refine((v) => !v.includes("://"));
const provider = z.enum(["openrouter", "nvidia"]);
const deploymentId = z
  .string()
  .min(1)
  .max(240)
  .regex(/^(openrouter|nvidia):[~A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const finite = z.number().finite().nonnegative();
const tokens = z.number().int().positive().max(2097152);
const capability = z.union([z.boolean(), z.literal("unknown")]);
const date = z.iso.datetime();
const nullableCount = z.number().int().nonnegative().nullable();
const configSchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: z.boolean(),
    routing: z
      .object({
        mode: z.enum(["manual", "auto"]),
        priority: z.enum(["balanced", "quality", "cost", "speed"]),
        selectedDeploymentId: deploymentId.nullable(),
        allowedProviders: z.array(provider).min(1).max(2),
        unverifiedContext: z.enum(["strict", "warn", "allow"]),
        allowFallback: z.boolean(),
        allowCrossProviderFallback: z.boolean(),
        allowModelSwitch: z.boolean(),
        weights: z
          .object({
            quality: finite.max(1),
            cost: finite.max(1),
            latency: finite.max(1),
            reliability: finite.max(1),
          })
          .strict()
          .refine((w) => Object.values(w).some((v) => v > 0)),
        benchmarkMaxAgeDays: z.number().int().min(1).max(365),
      })
      .strict(),
    generation: z
      .object({
        streaming: z.boolean().default(true),
        maxOutputTokens: tokens.max(131072),
        contextWindow: tokens.min(512),
        headroomFraction: finite.max(0.5),
        temperature: finite.max(2),
        format: z.enum(["text", "json"]),
        jsonSchema: z.record(z.string(), z.unknown()).nullable(),
      })
      .strict(),
    budget: z
      .object({
        maxEstimatedUsd: finite.nullable(),
        maxTotalTokens: tokens.nullable(),
      })
      .strict(),
    reliability: z
      .object({
        maxAttempts: z.number().int().min(1).max(4),
        deadlineMs: z.number().int().min(1000).max(600000),
        backoffMs: z.number().int().min(0).max(10000),
        cooldownMs: z.number().int().min(1000).max(300000),
        circuitThreshold: z.number().int().min(1).max(10),
      })
      .strict(),
    gateway: z
      .object({
        enabled: z.boolean(),
        baseUrl: z
          .string()
          .regex(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/v1$/)
          .refine((v) => {
            try {
              return Number(new URL(v).port) <= 65535;
            } catch {
              return false;
            }
          }),
        version: z.literal("1.106.6"),
      })
      .strict(),
    telemetry: z
      .object({
        retentionDays: z.number().int().min(1).max(90),
        rawPromptLogging: z.boolean(),
        rawResponseLogging: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .refine((v) => v.generation.maxOutputTokens < v.generation.contextWindow);
const profileSchema = z
  .object({
    deploymentId,
    modelId,
    logicalModelId: modelId,
    providerId: provider,
    label: z.string().min(1).max(300),
    inputModalities: z.array(z.string().max(30)).max(10),
    outputModalities: z.array(z.string().max(30)).max(10),
    tools: capability,
    vision: capability,
    structuredOutput: capability,
    supportedParameters: z.array(z.string().max(60)).max(100).nullable(),
    contextTokens: tokens.nullable(),
    maxOutputTokens: tokens.nullable(),
    inputUsdPerMillion: finite.nullable(),
    outputUsdPerMillion: finite.nullable(),
    source: z
      .object({
        url: z.enum([
          "https://openrouter.ai/api/v1/models",
          "https://integrate.api.nvidia.com/v1/models",
        ]),
        checkedAt: date,
        kind: z.enum(["provider-catalog", "local-override"]),
      })
      .strict(),
  })
  .strict();
const evidenceSchema = z
  .object({
    deploymentId,
    modelVersion: modelId,
    task: z.enum(["general", "finance", "format", "retrieval", "conversation"]),
    benchmark: z.string().min(1).max(128),
    dataset: z.string().min(1).max(128),
    methodology: z.string().min(1).max(500),
    position: z.enum(["beginning", "middle", "end", "not-applicable"]),
    contextTokens: tokens,
    contextMeasurement: z
      .enum(["estimated", "provider-reported"])
      .default("estimated"),
    transport: z.enum(["direct", "litellm"]).default("direct"),
    score: finite.max(1),
    successRate: finite.max(1),
    repetitions: z.number().int().min(2).max(100000),
    uncertainty: finite.max(1),
    medianTtftMs: finite.nullable(),
    medianE2eMs: finite.nullable(),
    checkedAt: date,
  })
  .strict();
const errorSchema = z.object({
  code: z.string().max(80),
  message: z.string().max(1000),
  details: z.record(z.string(), z.unknown()),
});
const messageSchema = z
  .object({
    id,
    conversationId: id,
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(2000000),
    createdAt: date,
    runId: id.optional(),
    userMessageId: id.optional(),
    model: modelId.optional(),
    provider: provider.optional(),
  })
  .strict();
const conversationSchema = z
  .object({
    schemaVersion: z.literal(5),
    mode: z.literal("front-office"),
    id,
    title: z.string().min(1).max(120),
    createdAt: date,
    updatedAt: date,
    selection: deploymentId.nullable(),
    messages: z.array(messageSchema).max(1000),
    attempts: z
      .array(
        z
          .object({
            requestId: id,
            runId: id,
            userMessageId: id,
            status: z.enum([
              "pending",
              "succeeded",
              "failed",
              "cancelled",
              "interrupted",
            ]),
            error: errorSchema.nullable(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
const requestSchema = z
  .object({
    conversationId: id,
    requestId: id,
    userMessage: z.string().trim().min(1).max(200000),
    transport: z.enum(["direct", "litellm"]).default("direct"),
    task: z
      .enum(["general", "finance", "format", "retrieval", "conversation"])
      .default("general"),
    retryOf: id.optional(),
  })
  .strict();

/** Validate complete non-secret configuration; no silent unknown fields. */
function validateConfig(value) {
  const parsed = parse(configSchema, value);
  require("./response-processor.cjs").validateSchemaDefinition(
    parsed.generation.jsonSchema,
  );
  return parsed;
}
/** Return a fresh safe starting configuration, never a mutable shared object. */
function defaultConfig() {
  return validateConfig(structuredClone(defaults));
}
module.exports = {
  z,
  parse,
  id,
  modelId,
  deploymentId,
  provider,
  nullableCount,
  profileSchema,
  evidenceSchema,
  conversationSchema,
  requestSchema,
  validateConfig,
  defaultConfig,
};
