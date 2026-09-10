"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatController } from "../chat/use-chat-runtime";
import type { ModelSettings as Settings } from "../../types/ai";

export function ModelSettings({
  chat,
  onClose,
}: {
  chat: ChatController;
  onClose: () => void;
}) {
  const keyInput = useRef<HTMLInputElement>(null);
  const starredModels = (chat.registry?.models ?? [])
    .filter(
      (model) =>
        chat.modelChecks[model.providerId + "/" + model.modelId]?.passed,
    )
    .sort(
      (a, b) =>
        chat.modelChecks[a.providerId + "/" + a.modelId].latencyMs -
        chat.modelChecks[b.providerId + "/" + b.modelId].latencyMs,
    );
  const nvidiaKeyInput = useRef<HTMLInputElement>(null);
  const nvidia = chat.registry?.providers.find(
    (provider) => provider.id === "nvidia",
  );
  const providerName =
    chat.registry?.settings.providerId === "nvidia" ? "NVIDIA NIM" : "Gemini";
  const remote =
    !!chat.registry && chat.registry.settings.providerId !== "ollama";
  const gemini = chat.registry?.providers.find(
    (provider) => provider.id === "gemini",
  );
  const [draft, setDraft] = useState<Settings | null>(
    chat.registry?.settings ?? null,
  );
  useEffect(
    () => setDraft(chat.registry?.settings ?? null),
    [chat.registry?.settings],
  );
  const selectedModel = chat.registry?.models.find(
    (model) =>
      model.providerId === chat.registry?.settings.providerId &&
      model.modelId === chat.registry?.settings.modelId,
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
            detail: chat.runtime.error ?? "Connecting to the model service.",
          }
        : !chat.registry.online || chat.runtime.state === "MODEL_OFFLINE"
          ? {
              label: remote
                ? (chat.registry.error?.code.replaceAll("_", " ") ??
                  `${providerName} unavailable`)
                : "Ollama offline",
              tone: "error",
              detail: remote
                ? (chat.registry.error?.message ??
                  "Configure your online provider below, then refresh models.")
                : "Start Ollama on this computer, then refresh local models.",
            }
          : !selectedModel || chat.runtime.state === "MODEL_MISSING"
            ? {
                label: "Model needed",
                tone: "waiting",
                detail:
                  "Choose an available model below. Configure an online provider or install a model in Ollama, then refresh.",
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
                        detail: remote
                          ? `Online model selected. Approved context and included chat history will be sent to ${providerName}.`
                          : "Local model selected and approved context attached. The model loads when you send a message.",
                      };
  return (
    <section className="model-settings ai-terminal" aria-label="AI Terminal">
      <header>
        <div>
          <span className="ai-eyebrow">AI / CONFIGURATION</span>
          <h1>AI Terminal</h1>
          <p>Set up your model. Know when it is ready.</p>
        </div>
        <button onClick={onClose}>Back to workspace</button>
      </header>
      <section
        className="model-check-dashboard"
        aria-label="Model checks and starred models"
      >
        <div className="model-check-toolbar">
          <strong>Model checks · {starredModels.length} starred</strong>
          {chat.modelScan?.running && (
            <button onClick={chat.stopModelChecks}>Stop checks</button>
          )}
          {(["gemini", "nvidia"] as const).map((providerId) => (
            <button
              key={providerId}
              disabled={
                chat.busy ||
                !chat.registry?.providers.find(
                  (provider) => provider.id === providerId,
                )?.configured
              }
              onClick={() => void chat.recheckModels(providerId)}
            >
              Check {providerId === "gemini" ? "Gemini" : "NVIDIA"} models
            </button>
          ))}
        </div>
        <p role="status">
          {chat.modelScan?.running
            ? `Checking ${chat.modelScan.providerId}: ${chat.modelScan.completed}/${chat.modelScan.total} — ${chat.modelScan.model ?? "preparing"}`
            : (chat.modelScan?.note ??
              "Save an API key or start a check. Passing models appear here with a star.")}
        </p>
        <p>
          Settings stay available during checks. Choosing a model or saving
          settings stops the scan. Tests use synthetic data only.
        </p>
        {starredModels.length ? (
          <div className="starred-model-list">
            {starredModels.map((model) => (
              <article key={model.providerId + "/" + model.modelId}>
                <span>
                  <span className="model-check-star" aria-hidden="true">
                    ★
                  </span>{" "}
                  {model.displayName} <small>· {model.providerId}</small>
                </span>
                <button
                  disabled={chat.busy || model.active}
                  onClick={() =>
                    chat.saveSettings({
                      providerId: model.providerId,
                      modelId: model.modelId,
                    })
                  }
                >
                  {model.active ? "Using" : "Use starred model"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p>
            No passing models yet. Progress and results update as checks finish.
          </p>
        )}
      </section>
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
            {remote ? `${providerName} · ONLINE` : "Ollama · LOCAL"}{" "}
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
            {chat.context?.sources
              .map((source) => source.relativePath)
              .join(", ") ?? "No approved source"}
          </dd>
        </div>
      </dl>
      <p className="ai-privacy" role="note">
        {remote
          ? `ONLINE: Your approved source, question, and included conversation history are sent to ${providerName}.`
          : "LOCAL: Inference runs on this device through Ollama."}
      </p>
      <button onClick={chat.refreshModels} disabled={chat.busy}>
        Refresh Local Models / Online Models
      </button>
      <section className="provider-credentials" aria-label="Gemini credentials">
        <h2>Online · Gemini</h2>
        <p>
          {gemini?.configured
            ? "API key saved on this device"
            : "Not configured"}
        </p>
        <p>
          Gemini free-tier data may be used to improve Google products. Quotas
          and charges depend on your Google project. Model discovery does not
          establish free access.
        </p>
        <p>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
          >
            Get a Gemini API key
          </a>{" "}
          ·{" "}
          <a
            href="https://ai.google.dev/gemini-api/docs/pricing"
            target="_blank"
            rel="noreferrer"
          >
            Pricing and data use
          </a>
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const key = keyInput.current?.value.trim();
            if (!key || chat.busy) return;
            if (keyInput.current) keyInput.current.value = "";
            void chat.saveCredential(key);
          }}
        >
          <label>
            Gemini API key
            <input
              ref={keyInput}
              type="password"
              autoComplete="off"
              spellCheck={false}
              minLength={10}
              maxLength={512}
              required
              disabled={chat.busy || gemini?.secureStorageAvailable === false}
            />
          </label>
          <button
            type="submit"
            disabled={chat.busy || gemini?.secureStorageAvailable === false}
          >
            Save API key
          </button>
          <button
            type="button"
            disabled={chat.busy || !gemini?.configured}
            onClick={() => void chat.removeCredential()}
          >
            Remove API key
          </button>
        </form>
        {gemini?.secureStorageAvailable === false && (
          <p role="alert">
            Secure credential storage is unavailable on this device.
          </p>
        )}
        {gemini?.error && <p role="status">{gemini.error.message}</p>}
        <p>
          Saving a key checks connectivity and discovers models. Choose Use
          online below to enable remote inference. No source content is sent
          during discovery.
        </p>
      </section>
      <section className="provider-credentials" aria-label="NVIDIA credentials">
        <h2>Online · NVIDIA NIM</h2>
        <p>
          {nvidia?.configured
            ? nvidia.online
              ? "API key saved · Catalog reachable"
              : "API key saved · Catalog unavailable"
            : "Not configured"}
        </p>
        <p>
          Refresh models to discover NVIDIA chat candidates. A catalog listing
          does not prove inference access.
        </p>
        <p>
          Approved context and included conversation history will be sent to
          NVIDIA. Access, quotas, and pricing depend on your NVIDIA account.
        </p>
        <a href="https://build.nvidia.com" target="_blank" rel="noreferrer">
          Get an NVIDIA API key
        </a>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const key = nvidiaKeyInput.current?.value.trim();
            if (!key || chat.busy) return;
            if (nvidiaKeyInput.current) nvidiaKeyInput.current.value = "";
            void chat.saveCredential(key, "nvidia");
          }}
        >
          <label>
            NVIDIA API key
            <input
              ref={nvidiaKeyInput}
              type="password"
              autoComplete="off"
              spellCheck={false}
              minLength={10}
              maxLength={512}
              required
              disabled={
                chat.busy || !nvidia || nvidia.secureStorageAvailable === false
              }
            />
          </label>
          <button
            type="submit"
            disabled={
              chat.busy || !nvidia || nvidia.secureStorageAvailable === false
            }
          >
            Save NVIDIA API key
          </button>
          <button
            type="button"
            disabled={chat.busy || !nvidia?.configured}
            onClick={() => void chat.removeCredential("nvidia")}
          >
            Remove NVIDIA API key
          </button>
        </form>
        {nvidia?.secureStorageAvailable === false && (
          <p role="alert">
            Secure credential storage is unavailable on this device.
          </p>
        )}
        {nvidia?.error && <p role="status">{nvidia.error.message}</p>}
      </section>
      {(["ollama", "gemini", "nvidia"] as const).map((providerId) => (
        <section
          key={providerId}
          aria-label={
            providerId === "ollama"
              ? "Local models"
              : providerId === "nvidia"
                ? "NVIDIA models"
                : "Online models"
          }
        >
          <h2>
            {providerId === "ollama"
              ? "Local models"
              : providerId === "nvidia"
                ? "NVIDIA models"
                : "Online models"}
          </h2>
          <p>
            {providerId === "ollama"
              ? "Choose the installed model used for your next answer."
              : "Choose a discovered text model. Availability and quotas depend on your provider account."}
          </p>
          <div className="model-list">
            {providerId !== "ollama" && (
              <div className="model-check-summary" role="status">
                <p>
                  {
                    Object.values(chat.modelChecks).filter(
                      (check) =>
                        check.providerId === providerId && check.passed,
                    ).length
                  }{" "}
                  starred /{" "}
                  {
                    Object.values(chat.modelChecks).filter(
                      (check) => check.providerId === providerId,
                    ).length
                  }{" "}
                  checked. Stars mark a successful synthetic source check, not
                  guaranteed reliability or free access.
                </p>
                <p>
                  Saving an API key automatically checks its catalog with
                  synthetic data only. Checks use provider quota and may take
                  several minutes.
                </p>
                {chat.modelScan?.providerId === providerId && (
                  <p>
                    {chat.modelScan.running
                      ? `Checking ${chat.modelScan.completed}/${chat.modelScan.total}: ${chat.modelScan.model ?? "preparing"}`
                      : chat.modelScan.note}
                  </p>
                )}
                {chat.modelScan?.providerId === providerId &&
                chat.modelScan.running ? (
                  <button onClick={chat.stopModelChecks}>
                    Stop provider checks
                  </button>
                ) : (
                  <button
                    disabled={
                      chat.busy ||
                      !chat.registry?.providers.find((p) => p.id === providerId)
                        ?.configured
                    }
                    onClick={() => void chat.recheckModels(providerId)}
                  >
                    Recheck all models
                  </button>
                )}
              </div>
            )}
            {!chat.registry?.models.some(
              (model) => model.providerId === providerId,
            ) && (
              <p className="ai-empty">
                No {providerId === "ollama" ? "local" : "online"} models
                available.{" "}
                {providerId === "ollama"
                  ? "Start Ollama or install a model, then refresh."
                  : "Configure this provider and refresh models."}
              </p>
            )}
            {chat.registry?.models
              .filter((model) => model.providerId === providerId)
              .sort((a, b) => {
                if (providerId === "ollama") return 0;
                const ac = chat.modelChecks[a.providerId + "/" + a.modelId];
                const bc = chat.modelChecks[b.providerId + "/" + b.modelId];
                return (
                  Number(!!bc?.passed) - Number(!!ac?.passed) ||
                  (ac?.passed && bc?.passed
                    ? ac.latencyMs - bc.latencyMs
                    : 0) ||
                  a.displayName.localeCompare(b.displayName)
                );
              })
              .map((model) => (
                <article
                  key={model.providerId + "/" + model.modelId}
                  className={model.active ? "model-active" : undefined}
                >
                  <div>
                    <strong>
                      {chat.modelChecks[model.providerId + "/" + model.modelId]
                        ?.passed && (
                        <span
                          className="model-check-star"
                          aria-label="Passed model check"
                          title="Passed synthetic source check"
                        >
                          &#9733;{" "}
                        </span>
                      )}
                      {model.displayName}
                    </strong>
                    <p>
                      {model.modelId} ·{" "}
                      {model.location === "local"
                        ? "Installed · LOCAL"
                        : "ONLINE · Pricing depends on your project"}
                    </p>
                    {model.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                    {model.providerId !== "ollama" &&
                      chat.modelChecks[
                        model.providerId + "/" + model.modelId
                      ] && (
                        <p role="status">
                          {
                            chat.modelChecks[
                              model.providerId + "/" + model.modelId
                            ].message
                          }{" "}
                          ·{" "}
                          {(
                            chat.modelChecks[
                              model.providerId + "/" + model.modelId
                            ].latencyMs / 1000
                          ).toFixed(1)}
                          s ·{" "}
                          {new Date(
                            chat.modelChecks[
                              model.providerId + "/" + model.modelId
                            ].checkedAt,
                          ).toLocaleTimeString()}
                        </p>
                      )}
                  </div>
                  {model.providerId !== "ollama" && (
                    <button
                      disabled={chat.busy}
                      onClick={() =>
                        void chat.checkModel(
                          model.providerId as "gemini" | "nvidia",
                          model.modelId,
                        )
                      }
                    >
                      {chat.modelScan?.running &&
                      chat.modelScan.providerId === model.providerId &&
                      chat.modelScan.model === model.modelId
                        ? "Checking model…"
                        : "Check model"}
                    </button>
                  )}
                  <button
                    disabled={chat.busy || model.active}
                    onClick={() =>
                      chat.saveSettings({
                        providerId: model.providerId,
                        modelId: model.modelId,
                      })
                    }
                  >
                    {model.active
                      ? "Using"
                      : model.location === "remote"
                        ? "Use online"
                        : "Use"}
                  </button>
                </article>
              ))}
          </div>
        </section>
      ))}
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
              {!remote && (
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
              )}
              {(
                [
                  ["loadTimeoutMs", "Model load timeout"],
                  ["inactivityTimeoutMs", "Generation inactivity timeout"],
                  ["absoluteTimeoutMs", "Absolute run timeout"],
                ] as const
              )
                .filter(([key]) => !remote || key !== "loadTimeoutMs")
                .map(([key, label]) => (
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
      <p>Additional providers remain planned for a later integration.</p>
    </section>
  );
}
