const { OpenAIChatProvider } = require("./openai-chat-provider.cjs");
const { z, parse } = require("../schemas.cjs");
const { ModelRuntimeError } = require("../model-errors.cjs");
const modelId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^~?[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const catalogItem = z.object({
  id: modelId,
  name: z.string().max(300).nullable().optional(),
  context_length: z.number().int().positive().nullable().optional(),
  architecture: z
    .object({
      input_modalities: z.array(z.string()).optional(),
      output_modalities: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
  top_provider: z
    .object({
      max_completion_tokens: z.number().int().positive().nullable().optional(),
    })
    .nullable()
    .optional(),
});
// Validate the envelope separately so a new or malformed catalog row cannot
// discard every otherwise usable model. Execution still validates the slug.
const catalog = z.object({ data: z.array(z.unknown()).max(10000) });

class OpenRouterProvider extends OpenAIChatProvider {
  constructor(options) {
    super(options, {
      providerId: "openrouter",
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      modelSchema: modelId,
      consumeTrailingUsage: true,
      maxMessages: 64,
      headers: { "X-OpenRouter-Title": "QTerminal" },
    });
  }
  async listModels({ signal } = {}) {
    return this.request(
      "models",
      {},
      async (response) => {
        let raw = "",
          bytes = 0;
        const decoder = new TextDecoder("utf-8", { fatal: true });
        try {
          for await (const part of response.body) {
            bytes += part.byteLength;
            if (bytes > 16 * 1024 * 1024) throw new Error("Catalog too large");
            raw += decoder.decode(part, { stream: true });
          }
          raw += decoder.decode();
          const value = parse(
            catalog,
            JSON.parse(raw),
            "MODEL_INVALID_RESPONSE",
          );
          const models = new Map();
          let validRows = 0;
          for (const row of value.data) {
            const result = catalogItem.safeParse(row);
            if (!result.success) continue;
            validRows++;
            const item = result.data;
            if (
              item.architecture?.input_modalities &&
              !item.architecture.input_modalities.includes("text")
            )
              continue;
            if (
              item.architecture?.output_modalities &&
              !item.architecture.output_modalities.includes("text")
            )
              continue;
            models.set(item.id, {
              name: item.id,
              displayName: item.name ?? item.id,
              size: 0,
              capabilities: ["completion"],
              contextLength: item.context_length ?? null,
              outputLimit: item.top_provider?.max_completion_tokens ?? null,
            });
          }
          if (value.data.length && !validRows)
            throw new Error("Invalid catalog rows");
          return [...models.values()];
        } catch {
          throw new ModelRuntimeError(
            "MODEL_INVALID_RESPONSE",
            "OpenRouter returned an invalid model catalog. Refresh models to retry.",
          );
        }
      },
      { signal },
    );
  }
  async complete(request) {
    const key = await this.credentials.get("openrouter");
    const response = await super.complete(request);
    // Observer errors must never change a successful inference result.
    try {
      await this.onUsage?.(response.usage, key);
    } catch {}
    return response;
  }
}
module.exports = { OpenRouterProvider };
