import type { BrainScope, VaultSnapshot } from "../../types/electron";

export function getChatUnavailableReason({
  vaultStatus,
  brainScope,
  brainScopeBusy,
  brainScopeError,
}: Readonly<{
  vaultStatus: VaultSnapshot["status"] | null;
  brainScope: BrainScope | null;
  brainScopeBusy: boolean;
  brainScopeError: string | null;
}>): string | null {
  if (vaultStatus !== "ready")
    return "Open an available vault before asking the model.";
  if (brainScopeBusy) return "Preparing the current Brain Scope…";
  if (brainScopeError) return brainScopeError;
  if (!brainScope || brainScope.mode !== "active-context")
    return "Approve exactly one Markdown file in Active Context before chatting.";
  if (brainScope.sources.length !== 1)
    return "Chat requires exactly one file in Active Context.";
  const source = brainScope.sources[0];
  if (!["md", "markdown"].includes(source.type))
    return "Chat supports one Markdown source only.";
  if (source.missing || source.changed || !source.contentHash)
    return "The approved Markdown source is missing or changed. Refresh Active Context first.";
  return null;
}

export function chatErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" &&
    error &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : null;
  const message =
    error instanceof Error ? error.message : "The local model request failed.";
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
