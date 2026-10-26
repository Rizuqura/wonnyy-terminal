export function chatErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" &&
    error &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : null;
  const message =
    error instanceof Error ? error.message : "The model request failed.";
  if (code === "MODEL_OFFLINE")
    return "Ollama is offline. Start Ollama, then retry.";
  if (code === "MODEL_NOT_FOUND")
    return "The selected model is not installed. Refresh local models in Settings.";
  if (code === "MODEL_TIMEOUT")
    return "The model took too long to respond. Retry the request.";
  if (code === "MODEL_CANCELLED")
    return "The current model response was stopped.";
  if (code === "MODEL_CONTEXT_INVALID") return message;
  if (code?.startsWith("BRAIN_"))
    return `Approved context is no longer valid: ${message}`;
  return code ? `${message} (${code})` : message;
}
