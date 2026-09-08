const { ModelRuntimeError } = require("../model-errors.cjs");

async function readChatStream(response, onContent, onActivity) {
  const reader = response.body?.getReader();
  if (!reader)
    throw new ModelRuntimeError(
      "MODEL_INVALID_RESPONSE",
      "Ollama returned no response stream.",
    );
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let content = "";
  let final = null;
  const consume = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new ModelRuntimeError(
        "MODEL_INVALID_RESPONSE",
        "Ollama returned a malformed stream event.",
      );
    }
    if (final)
      throw new ModelRuntimeError(
        "MODEL_INVALID_RESPONSE",
        "Ollama sent data after completion.",
      );
    if (event.error)
      throw new ModelRuntimeError("PROVIDER_ERROR", String(event.error));
    if (
      typeof event.done !== "boolean" ||
      typeof event.message?.content !== "string"
    )
      throw new ModelRuntimeError(
        "MODEL_INVALID_RESPONSE",
        "Ollama returned an invalid chat event.",
      );
    content += event.message.content;
    if (content.length > 150_000)
      throw new ModelRuntimeError(
        "MODEL_INVALID_RESPONSE",
        "Model output exceeded the response safety limit.",
      );
    if (event.message.content) {
      onActivity?.();
      onContent?.(content);
    }
    if (event.done) final = { ...event, message: { content } };
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000)
        throw new ModelRuntimeError(
          "MODEL_INVALID_RESPONSE",
          "Ollama stream event exceeded the safety limit.",
        );
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      // Ollama's terminal event completes the answer even if HTTP stays open.
      if (final) {
        consume(buffer);
        return final;
      }
    }
    buffer += decoder.decode();
    consume(buffer);
    if (!final)
      throw new ModelRuntimeError(
        "MODEL_INVALID_RESPONSE",
        "Ollama stopped before completing its answer.",
      );
    return final;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

module.exports = { readChatStream };
