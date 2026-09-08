"use client";

import { useEffect, useState } from "react";
import type { ChatController } from "../chat/use-chat-runtime";
import type { ModelSettings as Settings } from "../../types/ai";

export function ModelSettings({
  chat,
  onClose,
}: {
  chat: ChatController;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Settings | null>(
    chat.registry?.settings ?? null,
  );
  useEffect(
    () => setDraft(chat.registry?.settings ?? null),
    [chat.registry?.settings],
  );
  const selectedModel = chat.registry?.models.find(
    (model) => model.modelId === chat.registry?.settings.modelId,
  );
  const running = Boolean(chat.runtime.requestId);
  const readiness =
    chat.runtime.state === "RESTART_REQUIRED"
      ? {
          label: "Restart required",
          tone: "error",
          detail: "Restart Wonnyy to reconnect the desktop model service.",
        }
      : !chat.registry
        ? {
            label: chat.runtime.error
              ? "Connection unavailable"
              : "Checking AI",
            tone: "waiting",
            detail:
              chat.runtime.error ?? "Connecting to the local model service.",
          }
        : !chat.registry.online || chat.runtime.state === "MODEL_OFFLINE"
          ? {
              label: "Ollama offline",
              tone: "error",
              detail:
                "Start Ollama on this computer, then refresh local models.",
            }
          : !selectedModel || chat.runtime.state === "MODEL_MISSING"
            ? {
                label: "Model needed",
                tone: "waiting",
                detail:
                  "Choose an installed local model below. If the list is empty, install a model in Ollama and refresh.",
              }
            : running
              ? {
                  label: chat.runtime.state.replaceAll("_", " "),
                  tone: "waiting",
                  detail:
                    "Your current response is still running. You can stop it here before changing models.",
                }
              : chat.runtime.error
                ? {
                    label: "Needs attention",
                    tone: "error",
                    detail: chat.runtime.error,
                  }
                : chat.busy
                  ? {
                      label: "Updating settings",
                      tone: "waiting",
                      detail: "Applying your model configuration.",
                    }
                  : chat.unavailableReason || !chat.context || !chat.attached
                    ? {
                        label: "Context needed",
                        tone: "waiting",
                        detail:
                          chat.unavailableReason ??
                          "Approve a Markdown source in Planet View, or resume your conversation's source.",
                      }
                    : {
                        label: "Ready to chat",
                        tone: "ready",
                        detail:
                          "Local model selected and approved context attached. The model loads when you send a message.",
                      };
  return (
    <section className="model-settings ai-terminal" aria-label="AI Terminal">
      <header>
        <div>
          <span className="ai-eyebrow">LOCAL AI / CONFIGURATION</span>
          <h1>AI Terminal</h1>
          <p>Set up your model. Know when it is ready.</p>
        </div>
        <button onClick={onClose}>Back to workspace</button>
      </header>
      <div
        className={`ai-readiness ai-readiness-${readiness.tone}`}
        role="status"
        aria-label="AI readiness"
      >
        <span className="ai-status-dot" aria-hidden="true" />
        <div>
          <strong>{readiness.label}</strong>
          <p>{readiness.detail}</p>
        </div>
        {running && (
          <button
            onClick={chat.stop}
            disabled={chat.runtime.state === "CANCELLING"}
          >
            Stop response
          </button>
        )}
      </div>
      <dl className="ai-overview">
        <div>
          <dt>PROVIDER</dt>
          <dd>
            Ollama{" "}
            <span>
              {chat.registry
                ? chat.registry.online
                  ? "Online"
                  : "Offline"
                : "Checking"}
            </span>
          </dd>
        </div>
        <div>
          <dt>SELECTED MODEL</dt>
          <dd>{chat.registry?.settings.modelId ?? "None selected"}</dd>
        </div>
        <div>
          <dt>ACTIVE CONTEXT</dt>
          <dd>
            {chat.context?.sources[0].relativePath ?? "No approved source"}
          </dd>
        </div>
      </dl>
      <h2>Local models</h2>
      <p>Choose the installed model used for your next answer.</p>
      <p>Active model: {chat.registry?.settings.modelId ?? "None selected"}</p>
      {chat.busy && (
        <p role="status">
          Stop the current response before changing models or settings.
        </p>
      )}
      <button onClick={chat.refreshModels} disabled={chat.busy}>
        Refresh Local Models
      </button>
      <div className="model-list">
        {chat.registry?.online && !chat.registry.models.length && (
          <p className="ai-empty">
            No local models found. Install a model in Ollama, then refresh this
            list.
          </p>
        )}
        {chat.registry?.models.map((model) => (
          <article
            key={model.modelId}
            className={model.active ? "model-active" : undefined}
          >
            <div>
              <strong>{model.displayName}</strong>
              <p>
                {model.profile} · Installed
                {model.recommended ? " · Recommended candidate" : ""}
              </p>
              {model.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
            <button
              disabled={chat.busy || model.active}
              onClick={() => chat.saveSettings({ modelId: model.modelId })}
            >
              {model.active ? "Using" : "Use"}
            </button>
          </article>
        ))}
      </div>
      {draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            chat.saveSettings(draft);
          }}
        >
          <h2>Generation</h2>
          <div className="model-fields">
            <label>
              Context window
              <input
                type="number"
                min={2048}
                max={32768}
                step={1}
                value={draft.contextWindow}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    contextWindow: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Output limit
              <input
                type="number"
                min={128}
                max={8192}
                value={draft.outputLimit}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    outputLimit: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Temperature
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    temperature: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.streaming}
                onChange={(event) =>
                  setDraft({ ...draft, streaming: event.target.checked })
                }
              />{" "}
              Stream answers
            </label>
          </div>
          <details>
            <summary>Advanced</summary>
            <div className="model-fields">
              <label>
                Keep model loaded (seconds)
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={draft.keepAliveSeconds}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      keepAliveSeconds: Number(event.target.value),
                    })
                  }
                />
              </label>
              {(
                [
                  ["loadTimeoutMs", "Model load timeout"],
                  ["inactivityTimeoutMs", "Generation inactivity timeout"],
                  ["absoluteTimeoutMs", "Absolute run timeout"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label} (seconds)
                  <input
                    type="number"
                    min={1}
                    max={1800}
                    value={draft[key] / 1000}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [key]: Number(event.target.value) * 1000,
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <button type="submit" disabled={chat.busy}>
            Save generation settings
          </button>
        </form>
      )}
      {(chat.runtime.error || chat.registry?.error) && (
        <p role="alert">
          {chat.runtime.error ?? chat.registry?.error?.message}
        </p>
      )}
      <details>
        <summary>Latest run diagnostics</summary>
        <pre>
          {JSON.stringify(
            chat.runtime.diagnostics ?? {
              status: "No completed run this session",
            },
            null,
            2,
          )}
        </pre>
      </details>
      <h2>General / API</h2>
      <p>OpenAI · Anthropic · Google — Coming later</p>
    </section>
  );
}
