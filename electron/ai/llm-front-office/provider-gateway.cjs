/** Purpose: provider-neutral experiment transport, no agent prompt translation or retries.
 * Inputs: text messages/generation settings/AbortSignal; outputs: normalized content/usage/finish.
 * Dependencies: existing secure HTTP request adapter; SSE parser below. Knobs: direct or loopback LiteLLM.
 * Failures: safe transport/schema errors, no raw provider body. Owner: backend. */
const { OpenAIChatProvider } = require("../providers/openai-chat-provider.cjs");
const { ModelRuntimeError } = require("../model-errors.cjs");
const {
  z,
  parse,
  modelId,
  validateConfig,
} = require("./experiment-contracts.cjs");
const MAX_STREAM_BYTES = 4 * 1024 * 1024;
const chunkSchema = z.object({
  model: z.string().max(200).optional(),
  choices: z
    .array(
      z.object({
        index: z.number().int().optional(),
        delta: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
          tool_calls: z.unknown().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .max(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      completion_tokens_details: z
        .object({ reasoning_tokens: z.number().int().nonnegative().optional() })
        .optional(),
    })
    .nullable()
    .optional(),
});
const invalid = () =>
  new ModelRuntimeError(
    "MODEL_INVALID_RESPONSE",
    "The provider returned an invalid or incomplete experimental stream.",
  );

/** Parse SSE across arbitrary boundaries, comments and trailing usage; callbacks contain cumulative visible text. */
async function consumeStream(
  response,
  touch,
  request,
  providerId,
  requestedModel,
) {
  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    throw invalid();
  const start = performance.now();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "",
    data = [],
    content = "",
    finishReason = null,
    bytes = 0,
    doneEvent = false,
    usage = null,
    actualModel = null,
    firstTokenMs = null,
    refusal = false;
  const event = () => {
    if (!data.length) return;
    const raw = data.join("\n");
    data = [];
    if (raw === "[DONE]") {
      doneEvent = true;
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw invalid();
    }
    if (parsed.error)
      throw new ModelRuntimeError(
        "REMOTE_SERVER_ERROR",
        "The provider reported a stream error. Retry explicitly if any text was received.",
      );
    const chunk = parse(chunkSchema, parsed, "MODEL_INVALID_RESPONSE");
    const choice = chunk.choices[0];
    if ((choice?.index && choice.index !== 0) || choice?.delta.tool_calls)
      throw invalid();
    if (choice?.delta.refusal) refusal = true;
    if (choice?.delta.content) {
      if (finishReason) throw invalid();
      content += choice.delta.content;
      firstTokenMs ??= Math.round(performance.now() - start);
      request.onGenerationStarted?.();
      request.onContent?.(content);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
    if (chunk.model && modelId.safeParse(chunk.model).success)
      actualModel = chunk.model;
  };
  const reader = response.body.getReader();
  try {
    while (!doneEvent) {
      request.signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      bytes += value.byteLength;
      if (bytes > MAX_STREAM_BYTES) throw invalid();
      touch();
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (!line) {
          event();
          if (doneEvent) break;
        } else if (line.startsWith("data:"))
          data.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (!doneEvent) {
      if (buffer.startsWith("data:")) data.push(buffer.slice(5).trimStart());
      event();
    }
    if (!finishReason) throw invalid();
    return {
      provider: providerId,
      model: actualModel ?? requestedModel,
      content,
      finishReason: refusal ? "content_filter" : finishReason,
      usage: {
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        totalDurationNs: Math.round((performance.now() - start) * 1000000),
      },
      reasoningTokens:
        usage?.completion_tokens_details?.reasoning_tokens ?? null,
      diagnostics: { firstTokenMs },
    };
  } catch (error) {
    if (error instanceof ModelRuntimeError || request.signal?.aborted)
      throw error;
    throw invalid();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Create an LLMClient for the explicitly permitted endpoint; provider keys stay in the main process. */
function createLLMClient({ model, transport, config, registry, credentials }) {
  validateConfig(config);
  if (transport === "litellm" && !config.gateway.enabled)
    throw new ModelRuntimeError(
      "MODEL_INVALID_REQUEST",
      "Enable the authenticated local LiteLLM gateway first.",
    );
  const adapter =
    transport === "litellm"
      ? new OpenAIChatProvider(
          { credentials },
          {
            providerId: "litellm",
            label: "LiteLLM",
            baseUrl: config.gateway.baseUrl,
          },
        )
      : registry.providerFor(model.providerId);
  const wireModel =
    transport === "litellm"
      ? `${model.providerId === "nvidia" ? "nvidia_nim" : "openrouter"}/${model.modelId}`
      : model.modelId;
  return {
    /** Perform exactly one inference call with identical A/B messages and generation options. */
    complete(request) {
      const g = config.generation;
      const body = {
        model: wireModel,
        messages: request.messages,
        temperature: g.temperature,
        max_tokens: g.maxOutputTokens,
        stream: true,
        ...(g.format === "json"
          ? {
              response_format: g.jsonSchema
                ? {
                    type: "json_schema",
                    json_schema: {
                      name: "qterminal_output",
                      strict: true,
                      schema: g.jsonSchema,
                    },
                  }
                : { type: "json_object" },
            }
          : {}),
      };
      return adapter.request(
        "chat/completions",
        { method: "POST", body: JSON.stringify(body) },
        (response, touch) =>
          consumeStream(
            response,
            touch,
            request,
            model.providerId,
            model.modelId,
          ),
        {
          signal: request.signal,
          timeoutMs: config.reliability.deadlineMs,
          absoluteMs: config.reliability.deadlineMs,
        },
      );
    },
  };
}
/** Authenticated, loopback-only liveness check; no provider inference or process startup. */
async function gatewayHealth(config, credentials) {
  validateConfig(config);
  if (!config.gateway.enabled)
    return {
      status: "disabled",
      pinnedVersion: config.gateway.version,
      versionVerified: false,
    };
  const adapter = new OpenAIChatProvider(
    { credentials },
    {
      providerId: "litellm",
      label: "LiteLLM",
      baseUrl: config.gateway.baseUrl.replace(/\/v1$/, ""),
    },
  );
  await adapter.request("health/liveliness", {}, async () => true, {
    timeoutMs: 3000,
  });
  return {
    status: "reachable",
    pinnedVersion: config.gateway.version,
    versionVerified: false,
  };
}
module.exports = { createLLMClient, consumeStream, gatewayHealth };
