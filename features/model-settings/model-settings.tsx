"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatController } from "../chat/use-chat-runtime";
import type {
  ModelDescriptor,
  ModelSettings as Settings,
} from "../../types/ai";

const providers = [
  {
    id: "ollama",
    name: "Ollama",
    description: "Run on your device",
    mark: "O",
    url: "https://ollama.com",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "One key, more models",
    mark: "↗",
    url: "https://openrouter.ai/settings/keys",
  },
  {
    id: "gemini",
    name: "Gemini",
    description: "Models from Google",
    mark: "G",
    url: "https://aistudio.google.com/apikey",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    description: "Hosted inference",
    mark: "N",
    url: "https://build.nvidia.com",
  },
] as const;
type ProviderId = Settings["providerId"];

export function ModelSettings({
  chat,
  onClose,
  vaultPath,
  changingVault,
  onChangeVault,
}: {
  chat: ChatController;
  onClose: () => void;
  vaultPath: string | null;
  changingVault: boolean;
  onChangeVault: () => void;
}) {
  const [providerId, setProviderId] = useState<ProviderId>(
    chat.registry?.settings.providerId ?? "ollama",
  );
  const [query, setQuery] = useState("");
  const [downloadName, setDownloadName] = useState("qwen3:4b");
  const [draft, setDraft] = useState<Settings | null>(
    chat.registry?.settings ?? null,
  );
  const keyInput = useRef<HTMLInputElement>(null);
  const savingKey = useRef(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keySavedFor, setKeySavedFor] = useState<ProviderId | null>(null);
  useEffect(
    () => setDraft(chat.registry?.settings ?? null),
    [chat.registry?.settings],
  );
  const selected = providers.find((provider) => provider.id === providerId)!;
  const status = chat.registry?.providers.find(
    (provider) => provider.id === providerId,
  );
  const active = chat.registry?.settings;
  const activeProvider = providers.find(
    (provider) => provider.id === active?.providerId,
  );
  const activeAvailable = chat.registry?.models.some(
    (model) =>
      model.providerId === active?.providerId &&
      model.modelId === active?.modelId,
  );
  const remote = providerId !== "ollama";
  const running = Boolean(chat.runtime.requestId);
  const pulling = chat.pulls.some((pull) => pull.phase === "model-pulling");
  const catalog = (chat.registry?.models ?? []).filter(
    (model) => model.providerId === providerId,
  );
  const models = catalog
    .filter((model) =>
      `${model.displayName} ${model.modelId}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const first = chat.modelChecks[a.providerId + "/" + a.modelId],
        second = chat.modelChecks[b.providerId + "/" + b.modelId];
      return (
        Number(Boolean(second?.passed)) - Number(Boolean(first?.passed)) ||
        (first?.passed && second?.passed
          ? first.latencyMs - second.latencyMs
          : 0)
      );
    });
  const useModel = (model: ModelDescriptor) => {
    const contextWindow = Math.min(
      active?.contextWindow ?? 8192,
      model.contextLength ?? 32768,
    );
    const outputLimit = Math.min(
      active?.outputLimit ?? 2048,
      model.outputLimit ?? 8192,
      contextWindow - 513,
    );
    void chat.saveSettings({
      providerId,
      modelId: model.modelId,
      contextWindow,
      outputLimit,
    });
  };
  return (
    <section className="model-settings ai-terminal" aria-label="Settings">
      <div className="ai-shell">
        <header className="ai-page-header">
          <div>
            <span className="ai-eyebrow">YOUR WORKSPACE</span>
            <h1>Settings</h1>
            <p>
              Manage your vault, providers, models and generation preferences.
            </p>
          </div>
          <button className="ai-back" onClick={onClose}>
            Back to workspace <span aria-hidden="true">↗</span>
          </button>
        </header>
        {chat.agent?.runtimeModel.modelId && (
          <p className="ai-privacy">
            {chat.agent.displayName} uses {chat.agent.runtimeModel.providerId} /{" "}
            {chat.agent.runtimeModel.modelId} from Agent Construction. These are
            shared defaults; choose Inherit shared Settings in its LLM node to
            use them.
          </p>
        )}
        <section
          className="ai-connect-card settings-vault-card"
          aria-label="Knowledge vault"
        >
          <div className="ai-section-heading">
            <div>
              <h2>Knowledge vault</h2>
              <p className="settings-vault-path">
                {vaultPath ?? "No vault selected"}
              </p>
            </div>
            <button disabled={changingVault} onClick={onChangeVault}>
              Change vault folder
            </button>
          </div>
        </section>
        <div className="ai-current" role="status" aria-label="AI readiness">
          <span
            className={`ai-status-dot${chat.registry?.online && activeAvailable ? " connected" : ""}`}
          />
          <div className="model-active">
            <strong>{active?.modelId ?? "No model selected"}</strong>
            <small>
              {activeProvider?.name ?? "Connecting"}
              {active
                ? active.providerId === "ollama"
                  ? " · Local"
                  : " · Cloud"
                : ""}
              {chat.canSend
                ? " - Ready to chat"
                : chat.registry?.online
                  ? activeAvailable
                    ? " - Connected"
                    : " - Model unavailable"
                  : " - Not connected"}
            </small>
          </div>
          {running ? (
            <button
              onClick={chat.stop}
              disabled={chat.runtime.state === "CANCELLING"}
            >
              Stop response
            </button>
          ) : (
            <span className="ai-chip">
              {chat.attached
                ? `${chat.context?.sources.length ?? 0} ${chat.context?.sources.length === 1 ? "source" : "sources"} attached`
                : "Choose a Context Box to chat"}
            </span>
          )}
        </div>
        <nav className="ai-provider-tabs" aria-label="AI providers">
          {providers.map((provider) => (
            <button
              key={provider.id}
              aria-pressed={providerId === provider.id}
              onClick={() => {
                if (providerId === provider.id) return;
                setKeySavedFor(null);
                setProviderId(provider.id);
                setQuery("");
                if (keyInput.current) keyInput.current.value = "";
              }}
            >
              <span className="ai-provider-mark" aria-hidden="true">
                {provider.mark}
              </span>
              <strong>{provider.name}</strong>
              <small>{provider.description}</small>
            </button>
          ))}
        </nav>
        <section
          className="ai-connect-card"
          aria-label={`${selected.name === "NVIDIA NIM" ? "NVIDIA" : selected.name} credentials`}
        >
          <div className="ai-section-heading">
            <div>
              <h2>{selected.name}</h2>
              <p>
                {remote
                  ? status?.configured
                    ? "Your key is saved securely on this device."
                    : "Add your API key to discover available models."
                  : "Connect to Ollama running on this computer."}
              </p>
            </div>
            <span className={`ai-chip${status?.online ? " success" : ""}`}>
              {status?.online
                ? "Connected"
                : status?.configured
                  ? "Not connected"
                  : remote
                    ? "Not configured"
                    : "Offline"}
            </span>
          </div>
          {remote ? (
            <>
              <form
                className="ai-key-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const input = keyInput.current;
                  const key = input?.value.trim();
                  if (
                    !input ||
                    !key ||
                    chat.busy ||
                    !status ||
                    status.secureStorageAvailable === false ||
                    savingKey.current
                  )
                    return;
                  savingKey.current = true;
                  setKeySaving(true);
                  setKeySavedFor(null);
                  try {
                    await chat.saveCredential(key, providerId, () => {
                      if (input !== keyInput.current) return;
                      setKeySavedFor(providerId);
                      if (input.value.trim() === key) input.value = "";
                    });
                  } finally {
                    savingKey.current = false;
                    setKeySaving(false);
                  }
                }}
              >
                <label>
                  {selected.name === "NVIDIA NIM" ? "NVIDIA" : selected.name}{" "}
                  API key
                  <input
                    key={providerId}
                    ref={keyInput}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    minLength={10}
                    maxLength={512}
                    placeholder={
                      status?.configured
                        ? "Enter a replacement key"
                        : "Paste your API key"
                    }
                  />
                </label>
                <button
                  className="ai-primary"
                  disabled={
                    chat.busy ||
                    keySaving ||
                    !status ||
                    status.secureStorageAvailable === false
                  }
                >
                  {keySaving ? "Saving key..." : "Save key"}
                </button>
                {status?.configured && (
                  <button
                    type="button"
                    disabled={chat.busy}
                    onClick={() => void chat.removeCredential(providerId)}
                  >
                    Remove key
                  </button>
                )}
              </form>
              {keySavedFor === providerId && status?.configured && (
                <p className="ai-subtle" role="status">
                  Key saved securely.
                  {status?.error
                    ? " Model discovery failed; see the connection error below."
                    : ""}
                </p>
              )}
              {chat.runtime.error && (
                <p className="ai-inline-error" role="alert">
                  {chat.runtime.error}
                </p>
              )}
              {!status && (
                <p className="ai-subtle" role="status">
                  {chat.runtime.error
                    ? chat.runtime.error
                    : "Connecting to the desktop app. You can enter your key while it connects."}
                </p>
              )}
              {status && chat.busy && !keySaving && (
                <p className="ai-subtle" role="status">
                  You can enter your key now. Save it when the current operation
                  finishes.
                </p>
              )}
              <div className="ai-key-footer">
                <a href={selected.url} target="_blank" rel="noreferrer">
                  Get an API key ↗
                </a>
                <span>
                  {providerId === "openrouter"
                    ? "Usage is billed to your OpenRouter account."
                    : "Usage and availability depend on your provider account."}
                </span>
              </div>
              {status?.secureStorageAvailable === false && (
                <p role="alert">
                  Secure credential storage is unavailable on this device.
                </p>
              )}
            </>
          ) : (
            <p className="ai-subtle">
              No API key needed. Ollama runs inference locally.
            </p>
          )}
          {status?.error && (
            <p className="ai-inline-error" role="status">
              {status.error.message}
            </p>
          )}
        </section>
        {chat.modelScan?.running && (
          <div className="ai-scan-status" role="status">
            <span>
              Checking {chat.modelScan.providerId} · {chat.modelScan.completed}/
              {chat.modelScan.total}
              <small>{chat.modelScan.model}</small>
            </span>
            <button onClick={chat.stopModelChecks}>Stop checks</button>
          </div>
        )}
        <section
          className="ai-models"
          aria-label={
            providerId === "ollama"
              ? "Local models"
              : providerId === "nvidia"
                ? "NVIDIA models"
                : providerId === "openrouter"
                  ? "OpenRouter models"
                  : "Online models"
          }
        >
          <div className="ai-section-heading">
            <div>
              <h2>
                Choose a model <span>{catalog.length}</span>
              </h2>
              <p>
                Used for your next answer. Your conversation stays with you.
              </p>
            </div>
            <button disabled={chat.busy} onClick={chat.refreshModels}>
              Refresh models
            </button>
          </div>
          <label className="ai-model-search">
            <span className="sr-only">Search models</span>
            <input
              aria-label="Search models"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${selected.name} models…`}
            />
          </label>
          <div className="model-list">
            {models.map((model) => {
              const check =
                chat.modelChecks[model.providerId + "/" + model.modelId];
              return (
                <article key={model.modelId}>
                  <div className="ai-model-name">
                    <strong>{model.displayName}</strong>
                    <small>{model.modelId}</small>
                    <span
                      title={
                        check
                          ? `Checked ${new Date(check.checkedAt).toLocaleString()}`
                          : undefined
                      }
                      className={check?.passed ? "model-check-star" : undefined}
                    >
                      {model.contextLength
                        ? `${model.contextLength.toLocaleString()} context`
                        : model.location === "local"
                          ? "Installed locally"
                          : "Cloud model"}
                      {check
                        ? ` · ${check.passed ? "\u2605 Check passed" : "Check failed"} · ${check.latencyMs} ms`
                        : ""}
                    </span>
                  </div>
                  <div className="ai-row-actions">
                    {remote && (
                      <button
                        disabled={chat.busy}
                        onClick={() =>
                          void chat.checkModel(providerId, model.modelId)
                        }
                      >
                        {chat.modelScan?.running &&
                        chat.modelScan.model === model.modelId
                          ? "Checking…"
                          : "Check model"}
                      </button>
                    )}
                    <button
                      className={model.active ? "ai-selected" : "ai-primary"}
                      disabled={
                        chat.busy ||
                        model.active ||
                        (model.contextLength !== null &&
                          model.contextLength < 2048)
                      }
                      onClick={() => useModel(model)}
                    >
                      {model.active
                        ? "Using"
                        : model.location === "remote"
                          ? "Use online"
                          : "Use"}
                    </button>
                  </div>
                </article>
              );
            })}
            {!models.length && (
              <div className="ai-empty">
                <strong>
                  {catalog.length
                    ? "No matching models"
                    : remote && !status?.configured
                      ? "Connect your provider first"
                      : "No models available yet"}
                </strong>
                <p>
                  {catalog.length
                    ? "Try a different model name."
                    : remote
                      ? "Save a key, then refresh the model catalog."
                      : "Start Ollama and install a model, then refresh."}
                </p>
              </div>
            )}
          </div>
          {remote && (
            <p className="ai-footnote">
              Model checks use a small synthetic prompt and provider quota. A
              passed check is a sample, not a reliability guarantee.
            </p>
          )}
        </section>
        {remote && (
          <details className="ai-advanced">
            <summary>Connection checks</summary>
            <section aria-label="Model checks and starred models">
              <p>
                {
                  Object.values(chat.modelChecks).filter(
                    (check) => check.providerId === providerId && check.passed,
                  ).length
                }{" "}
                passed /{" "}
                {
                  Object.values(chat.modelChecks).filter(
                    (check) => check.providerId === providerId,
                  ).length
                }{" "}
                checked
              </p>
              <p>
                {chat.modelScan?.providerId === providerId
                  ? chat.modelScan.note
                  : "Check models using synthetic sources only. This uses provider quota."}
              </p>
              <button
                disabled={chat.busy || !status?.configured}
                onClick={() => void chat.recheckModels(providerId)}
              >
                Recheck all models
              </button>
              {chat.modelScan?.running && (
                <button onClick={chat.stopModelChecks}>
                  Stop provider checks
                </button>
              )}
            </section>
          </details>
        )}
        {providerId === "ollama" && (
          <details className="ai-advanced">
            <summary>Install a local model</summary>
            <section aria-label="Local model downloads">
              <div className="ai-download-form">
                <label>
                  Ollama model
                  <input
                    value={downloadName}
                    maxLength={200}
                    onChange={(event) => setDownloadName(event.target.value)}
                    disabled={pulling}
                  />
                </label>
                <button
                  disabled={chat.busy || pulling || !downloadName.trim()}
                  onClick={() => void chat.downloadModel(downloadName.trim())}
                >
                  DOWNLOAD MODEL
                </button>
              </div>
              {chat.pulls.map((pull) => (
                <div
                  className="ai-download-status"
                  role="status"
                  key={pull.model}
                >
                  <strong>
                    {pull.model} ·{" "}
                    {pull.phase === "model-pulling"
                      ? "DOWNLOADING MODEL"
                      : pull.phase === "model-installed"
                        ? "MODEL INSTALLED"
                        : pull.phase === "cancelled"
                          ? "DOWNLOAD CANCELLED"
                          : "DOWNLOAD FAILED"}
                  </strong>
                  <p>{pull.message}</p>
                  {pull.progress?.total && (
                    <p>
                      Current layer: {(pull.progress.current / 1e9).toFixed(2)}{" "}
                      GB / {(pull.progress.total / 1e9).toFixed(2)} GB ·{" "}
                      {Math.floor(
                        (pull.progress.current / pull.progress.total) * 100,
                      )}
                      %
                    </p>
                  )}
                  {pull.phase === "model-pulling" && (
                    <button onClick={() => chat.cancelPull(pull.model)}>
                      CANCEL
                    </button>
                  )}
                </div>
              ))}
            </section>
          </details>
        )}
        {draft && (
          <details className="ai-advanced">
            <summary>Generation settings</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void chat.saveSettings(draft);
              }}
            >
              <p className="ai-subtle">
                Applied to the active model:{" "}
                {active?.modelId ?? "none selected"}.
              </p>
              <div className="model-fields">
                {(
                  [
                    ["contextWindow", "Context window", 2048, 32768, 1],
                    ["outputLimit", "Output limit", 128, 8192, 1],
                    ["temperature", "Temperature", 0, 2, 0.1],
                  ] as const
                ).map(([field, label, min, max, step]) => (
                  <label key={field}>
                    {label}
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={step}
                      value={draft[field]}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          [field]: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                ))}
                <label className="ai-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.streaming}
                    onChange={(event) =>
                      setDraft({ ...draft, streaming: event.target.checked })
                    }
                  />
                  Stream answers
                </label>
              </div>
              <details>
                <summary>Timeouts and memory</summary>
                <div className="model-fields">
                  {draft.providerId === "ollama" && (
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
                    .filter(
                      ([field]) =>
                        draft.providerId === "ollama" ||
                        field !== "loadTimeoutMs",
                    )
                    .map(([field, label]) => (
                      <label key={field}>
                        {label} (seconds)
                        <input
                          type="number"
                          min={1}
                          max={1800}
                          value={draft[field] / 1000}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              [field]: Number(event.target.value) * 1000,
                            })
                          }
                        />
                      </label>
                    ))}
                </div>
              </details>
              <button disabled={chat.busy} className="ai-primary">
                Save generation settings
              </button>
            </form>
          </details>
        )}
        {chat.runtime.error && (
          <p className="ai-inline-error" role="alert">
            {chat.runtime.error}
          </p>
        )}
        <footer className="ai-footer">
          <p className="ai-privacy">
            {active?.providerId === "ollama" ? "LOCAL: " : "ONLINE: "}
            {active?.providerId === "ollama"
              ? "Local inference through Ollama. Your source files stay on this device."
              : active?.providerId === "openrouter"
                ? "Your attached Context Box, configured agent references, question and included history are sent to OpenRouter and its model providers."
                : `Your attached Context Box, configured agent references, question and included history are sent to ${activeProvider?.name ?? "your selected provider"}.`}
          </p>
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
        </footer>
      </div>
    </section>
  );
}
