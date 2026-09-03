const crypto = require("node:crypto");
const { MODEL_ERROR_CODES, ModelRuntimeError } = require("../model-errors.cjs");

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function validateBaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "Ollama endpoint is not a valid URL.", { field: "baseUrl" });
  }
  if (url.protocol !== "http:" || !LOCAL_HOSTS.has(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "M7.1 only permits an unauthenticated local Ollama HTTP endpoint.", { endpoint: rawUrl });
  }
  return url.origin;
}

function validateModelName(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "Model must be a non-empty local Ollama model name.", { field: "model" });
  }
  return value.trim();
}

function validateMessages(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "Model messages must be a non-empty array of at most 100 entries.", { field: "messages" });
  }
  return value.map((message, index) => {
    if (!message || typeof message !== "object" || Array.isArray(message) || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content || message.content.length > 100_000) {
      throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "A model message is malformed.", { field: `messages[${index}]` });
    }
    return { role: message.role, content: message.content };
  });
}

function normalizeModel(value) {
  if (!value || typeof value !== "object" || typeof value.name !== "string" || typeof value.size !== "number") {
    throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_RESPONSE, "Ollama returned a malformed model record.");
  }
  return {
    name: value.name,
    model: typeof value.model === "string" ? value.model : value.name,
    size: value.size,
    digest: typeof value.digest === "string" ? value.digest : "",
    modifiedAt: typeof value.modified_at === "string" ? value.modified_at : null,
    family: typeof value.details?.family === "string" ? value.details.family : null,
    parameterSize: typeof value.details?.parameter_size === "string" ? value.details.parameter_size : null,
    quantization: typeof value.details?.quantization_level === "string" ? value.details.quantization_level : null,
    contextLength: typeof value.details?.context_length === "number" ? value.details.context_length : null,
    capabilities: Array.isArray(value.capabilities) ? value.capabilities.filter((item) => typeof item === "string") : [],
  };
}

class OllamaProvider {
  constructor(options = {}) {
    this.baseUrl = validateBaseUrl(options.baseUrl || process.env.WONNYY_OLLAMA_URL || DEFAULT_BASE_URL);
    this.fetch = options.fetchImpl || globalThis.fetch;
    this.statusTimeoutMs = options.statusTimeoutMs || 3_000;
    this.completionTimeoutMs = options.completionTimeoutMs || 120_000;
    if (typeof this.fetch !== "function") throw new ModelRuntimeError(MODEL_ERROR_CODES.NOT_INSTALLED, "This Electron runtime cannot connect to Ollama because fetch is unavailable.");
  }

  async request(pathname, options = {}, timeoutMs = this.statusTimeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response;
      try {
        response = await this.fetch(`${this.baseUrl}${pathname}`, { ...options, signal: controller.signal });
      } catch (error) {
        if (error?.name === "AbortError") throw new ModelRuntimeError(MODEL_ERROR_CODES.TIMEOUT, "Ollama did not respond before the request timed out.", { endpoint: this.baseUrl, timeoutMs });
        throw new ModelRuntimeError(MODEL_ERROR_CODES.OFFLINE, "Ollama is not reachable on this computer. Start Ollama and try again.", { endpoint: this.baseUrl });
      }
      let body;
      try {
        body = await response.json();
      } catch {
        throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_RESPONSE, "Ollama returned a response that was not valid JSON.", { status: response.status });
      }
      if (!response.ok) {
        const providerMessage = typeof body?.error === "string" ? body.error : `Ollama request failed with HTTP ${response.status}.`;
        const missing = response.status === 404 && /model.*(?:not found|missing)/iu.test(providerMessage);
        throw new ModelRuntimeError(missing ? MODEL_ERROR_CODES.NOT_FOUND : MODEL_ERROR_CODES.PROVIDER, providerMessage, { status: response.status });
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async listModels() {
    const body = await this.request("/api/tags");
    if (!Array.isArray(body?.models)) throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_RESPONSE, "Ollama model listing is malformed.");
    return body.models.map(normalizeModel).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getStatus() {
    const checkedAt = new Date().toISOString();
    try {
      const models = await this.listModels();
      return { provider: "ollama", endpoint: this.baseUrl, online: true, checkedAt, models, error: null };
    } catch (error) {
      if (!(error instanceof ModelRuntimeError)) throw error;
      return { provider: "ollama", endpoint: this.baseUrl, online: false, checkedAt, models: [], error: { code: error.code, message: error.message, details: error.details } };
    }
  }

  async complete(rawRequest) {
    if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "Model request must be an object.");
    const model = validateModelName(rawRequest.model);
    const messages = validateMessages(rawRequest.messages);
    const payload = { model, messages, stream: false, think: false, keep_alive: "5m", options: { temperature: 0, num_predict: 128 } };
    if (rawRequest.format !== undefined) {
      if (!rawRequest.format || typeof rawRequest.format !== "object" || Array.isArray(rawRequest.format) || JSON.stringify(rawRequest.format).length > 20_000) {
        throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "Structured output format must be a JSON schema object smaller than 20 KB.", { field: "format" });
      }
      payload.format = rawRequest.format;
    }
    const body = await this.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, this.completionTimeoutMs);
    if (body?.done !== true || typeof body?.message?.content !== "string" || typeof body?.model !== "string") {
      throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_RESPONSE, "Ollama returned an incomplete chat response.");
    }
    return {
      id: typeof rawRequest.id === "string" && rawRequest.id ? rawRequest.id : crypto.randomUUID(),
      provider: "ollama",
      model: body.model,
      content: body.message.content,
      finishReason: typeof body.done_reason === "string" ? body.done_reason : "stop",
      createdAt: typeof body.created_at === "string" ? body.created_at : new Date().toISOString(),
      usage: {
        promptTokens: Number.isFinite(body.prompt_eval_count) ? body.prompt_eval_count : null,
        completionTokens: Number.isFinite(body.eval_count) ? body.eval_count : null,
        totalDurationNs: Number.isFinite(body.total_duration) ? body.total_duration : null,
      },
      sources: [],
    };
  }

  async testModel(rawModel) {
    const model = validateModelName(rawModel);
    const models = await this.listModels();
    if (!models.some((item) => item.name === model || item.model === model)) {
      throw new ModelRuntimeError(MODEL_ERROR_CODES.NOT_FOUND, `Ollama model "${model}" is not installed. Pull it before running the Wonnyy test.`, { model });
    }
    const response = await this.complete({
      id: crypto.randomUUID(),
      model,
      messages: [{ role: "user", content: "Return the required connectivity status." }],
      format: {
        type: "object",
        properties: { status: { type: "string", const: "WONNYY ONLINE" } },
        required: ["status"],
        additionalProperties: false,
      },
    });
    let status = null;
    try {
      const parsed = JSON.parse(response.content);
      if (parsed && typeof parsed === "object" && typeof parsed.status === "string") status = parsed.status;
    } catch {}
    return { ...response, content: status ?? response.content, passed: status === "WONNYY ONLINE", expected: "WONNYY ONLINE" };
  }
}

module.exports = { DEFAULT_BASE_URL, OllamaProvider, validateBaseUrl };
