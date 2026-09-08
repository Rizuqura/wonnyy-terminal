const path = require("node:path");
const { readJson, writeJson, serialQueue } = require("./json-store.cjs");
const { ModelRuntimeError } = require("./model-errors.cjs");

const DEFAULTS = Object.freeze({
  schemaVersion: 1,
  providerId: "ollama",
  modelId: null,
  contextWindow: 8192,
  outputLimit: 2048,
  temperature: 0.2,
  streaming: true,
  keepAliveSeconds: 300,
  loadTimeoutMs: 300000,
  inactivityTimeoutMs: 120000,
  absoluteTimeoutMs: 600000,
});
const PROFILES = {
  "qwen3:4b": "balanced",
  "qwen3:1.7b": "fast",
  "llama3.2:3b": "balanced",
};

function validateSettings(value) {
  if (
    !value ||
    Object.keys(value).some((key) => !(key in DEFAULTS)) ||
    value.schemaVersion !== 1 ||
    value.providerId !== "ollama" ||
    !(
      value.modelId === null ||
      (typeof value.modelId === "string" && value.modelId.length <= 200)
    ) ||
    !Number.isInteger(value.contextWindow) ||
    value.contextWindow < 2048 ||
    value.contextWindow > 32768 ||
    !Number.isInteger(value.outputLimit) ||
    value.outputLimit < 128 ||
    value.outputLimit > 8192 ||
    value.outputLimit + 512 >= value.contextWindow ||
    !Number.isFinite(value.temperature) ||
    value.temperature < 0 ||
    value.temperature > 2 ||
    typeof value.streaming !== "boolean" ||
    !Number.isInteger(value.keepAliveSeconds) ||
    value.keepAliveSeconds < 0 ||
    value.keepAliveSeconds > 3600 ||
    ["loadTimeoutMs", "inactivityTimeoutMs", "absoluteTimeoutMs"].some(
      (key) =>
        !Number.isInteger(value[key]) ||
        value[key] < 1000 ||
        value[key] > 1800000,
    )
  ) {
    throw new ModelRuntimeError(
      "MODEL_INVALID_REQUEST",
      "Invalid model settings or generation limits.",
    );
  }
  return structuredClone(value);
}

class ModelRegistry {
  constructor(provider, settingsDirectory) {
    this.provider = provider;
    this.file = path.join(settingsDirectory, "model-settings.json");
    this.queue = serialQueue();
  }
  read() {
    return readJson(this.file, validateSettings, DEFAULTS);
  }
  async state() {
    let settings = await this.read();
    const status = await this.provider.getStatus();
    const models = status.models.map((model) => ({
      providerId: "ollama",
      modelId: model.name,
      displayName: model.name,
      location: "local",
      installed: true,
      available: true,
      active: model.name === settings.modelId,
      profile: PROFILES[model.name] ?? "unprofiled",
      recommended: model.name === "qwen3:4b",
      capabilities: model.capabilities,
      contextLength: model.contextLength,
      warnings:
        model.size > 4_500_000_000
          ? ["High memory use on an 8 GB device."]
          : [],
    }));
    if (
      !settings.modelId &&
      models.some((model) => model.modelId === "qwen3:4b")
    ) {
      settings = await this.save({ modelId: "qwen3:4b" });
    }
    return {
      online: status.online,
      error: status.error,
      settings,
      models: models.map((model) => ({
        ...model,
        active: model.modelId === settings.modelId,
      })),
    };
  }
  save(patch) {
    return this.queue(async () => {
      if (!patch || typeof patch !== "object" || Array.isArray(patch))
        throw new ModelRuntimeError(
          "MODEL_INVALID_REQUEST",
          "Model settings must be an object.",
        );
      const settings = validateSettings({ ...(await this.read()), ...patch });
      await this.validateSelection(settings);
      await writeJson(this.file, settings);
      return settings;
    });
  }
  async validateSelection(settings) {
    if (!settings.modelId)
      throw new ModelRuntimeError(
        "MODEL_NOT_FOUND",
        "Select an installed local model in Settings.",
      );
    const models = await this.provider.listModels();
    const selected = models.find((model) => model.name === settings.modelId);
    if (!selected)
      throw new ModelRuntimeError(
        "MODEL_NOT_FOUND",
        `The selected model ${settings.modelId} is not installed. Refresh Models in Settings.`,
      );
    const details =
      typeof this.provider.describeModel === "function"
        ? await this.provider.describeModel(settings.modelId)
        : selected;
    if (
      details.capabilities?.length &&
      !details.capabilities.includes("completion")
    )
      throw new ModelRuntimeError(
        "MODEL_INVALID_REQUEST",
        "This model does not support text completion.",
      );
    if (details.contextLength && settings.contextWindow > details.contextLength)
      throw new ModelRuntimeError(
        "MODEL_CONTEXT_TOO_LARGE",
        `This model supports at most ${details.contextLength} context tokens.`,
      );
    return settings;
  }
}

module.exports = { DEFAULTS, ModelRegistry, validateSettings };
