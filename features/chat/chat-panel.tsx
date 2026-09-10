"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { ChatController } from "./use-chat-runtime";
import { ConversationHistory } from "./conversation-history";
import { useConfirmation } from "../dialogs/use-confirmation";

export type { ChatMessage } from "../../types/ai";
export type ChatPanelProps = {
  variant?: "panel" | "floating";
  controller: ChatController;
  onOpenSource: (path: string) => void;
};

export function ChatPanel({
  variant = "panel",
  controller: chat,
  onOpenSource,
}: Readonly<ChatPanelProps>) {
  const isFloating = variant === "floating";
  const { confirm, confirmation } = useConfirmation();
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const panelRef = useRef<HTMLElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Restore focus only after an action inside this chat surface. Context
  // updates and model events must not steal focus from Explorer or Search.
  const focusComposer = () =>
    composerRef.current?.focus({ preventScroll: true });
  const followTail = useRef(true);
  useEffect(() => {
    const panel = panelRef.current;
    // Planet View uses a native wheel listener. Stop it at the chat surface
    // before React's delegated event handler would run; preserve native scrolling.
    const containWheel = (event: WheelEvent) => event.stopPropagation();
    panel?.addEventListener("wheel", containWheel, { passive: true });
    return () => panel?.removeEventListener("wheel", containWheel);
  }, []);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    width: number;
    height: number;
    left: number;
    top: number;
  } | null>(null);
  const messages = chat.conversation?.messages ?? [];
  const transcript = useMemo(() => {
    const attempts = new Map(
      chat.conversation?.attempts.map((attempt) => [
        attempt.userMessageId,
        attempt,
      ]),
    );
    let previousModel: string | undefined;
    return (chat.conversation?.messages ?? []).map((message) => {
      const identity = message.model
        ? `${message.provider ?? "ollama"}/${message.model}`
        : undefined;
      const modelChanged = Boolean(
        identity && previousModel && identity !== previousModel,
      );
      if (identity) previousModel = identity;
      return { message, modelChanged, attempt: attempts.get(message.id) };
    });
  }, [chat.conversation]);
  const latest = chat.conversation?.attempts.at(-1);
  const error = chat.runtime.error ?? latest?.error?.message;
  const statusLabel =
    chat.busy &&
    chat.runtime.diagnostics?.timeoutRetryCount === 1 &&
    ["MODEL_LOADING", "GENERATING"].includes(chat.runtime.state)
      ? "Retrying slow response automatically (1/1)…"
      : chat.runtime.state.replaceAll("_", " ");
  useEffect(() => {
    if (followTail.current)
      threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, chat.runtime.content]);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chat.busy) chat.submit();
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !isFloating ||
      event.button !== 0 ||
      (event.target as Element).closest("button")
    )
      return;
    const panel = panelRef.current;
    const parent = panel?.offsetParent as HTMLElement | null;
    if (!panel || !parent) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    setPosition({
      left: rect.left - parentRect.left,
      top: rect.top - parentRect.top,
    });
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragRef.current;
    const panel = panelRef.current;
    const parent = panel?.offsetParent as HTMLElement | null;
    if (!origin || !panel || !parent) return;
    const parentRect = parent.getBoundingClientRect();
    const maxLeft = Math.max(0, parentRect.width - panel.offsetWidth);
    const maxTop = Math.max(0, parentRect.height - panel.offsetHeight);
    setPosition({
      left: Math.min(
        maxLeft,
        Math.max(0, event.clientX - parentRect.left - origin.offsetX),
      ),
      top: Math.min(
        maxTop,
        Math.max(0, event.clientY - parentRect.top - origin.offsetY),
      ),
    });
  };

  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    const parent = panel?.offsetParent as HTMLElement | null;
    if (!isFloating || !panel || !parent || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const left = rect.left - parentRect.left;
    const top = rect.top - parentRect.top;
    setPosition({ left, top });
    setSize({ width: rect.width, height: rect.height });
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      left,
      top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeRef.current;
    const panel = panelRef.current;
    const parent = panel?.offsetParent as HTMLElement | null;
    if (!start || !panel || !parent) return;
    const parentRect = parent.getBoundingClientRect();
    setSize({
      width: Math.min(
        parentRect.width - start.left,
        Math.max(240, start.width + event.clientX - start.startX),
      ),
      height: Math.min(
        parentRect.height - start.top,
        Math.max(180, start.height + event.clientY - start.startY),
      ),
    });
  };

  const stopResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const floatingStyle = isFloating
    ? ({
        ...(position
          ? { left: position.left, right: "auto", top: position.top }
          : {}),
        ...(size
          ? { width: size.width, height: isMinimized ? undefined : size.height }
          : {}),
      } as CSSProperties)
    : undefined;

  return (
    <aside
      ref={panelRef}
      style={floatingStyle}
      className={`chat-panel${isFloating ? " chat-panel-floating" : ""}${isFloating && isMinimized ? " chat-panel-minimized" : ""}`}
      aria-label="Wonnyy model chat"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div
        className="chat-header"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <span>WONNYY CHAT</span>
        <span className="chat-runtime-status" role="status">
          {statusLabel}
        </span>
        {isFloating && (
          <button
            className="chat-window-control"
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            aria-label={
              isMinimized ? "Restore chat window" : "Minimize chat window"
            }
          >
            {isMinimized ? "□" : "─"}
          </button>
        )}
      </div>
      <div className="chat-context">
        <span>
          {chat.registry?.settings.providerId !== "ollama" && !!chat.registry
            ? `ONLINE · ${chat.registry?.settings.providerId === "nvidia" ? "NVIDIA NIM" : "Gemini"}`
            : "LOCAL · Ollama"}{" "}
          · {chat.registry?.settings.modelId ?? "Choose a model in Settings"}
        </span>
        <p className="chat-privacy">
          {chat.registry?.settings.providerId !== "ollama" && !!chat.registry
            ? `Approved source, your question, and included conversation history are sent to ${chat.registry?.settings.providerId === "nvidia" ? "NVIDIA" : "Google Gemini"}.`
            : "Inference runs on this device."}
        </p>
        <p className="chat-memory">
          Model memory: up to 12 recent exchanges, fewer when the context limit
          is reached. Saved history remains available.
          {typeof chat.runtime.diagnostics?.droppedExchanges === "number" &&
          chat.runtime.diagnostics.droppedExchanges > 0
            ? ` Last answer omitted ${chat.runtime.diagnostics.droppedExchanges} earlier exchanges.`
            : ""}
        </p>
        <strong>
          Active Context:{" "}
          {chat.context?.sources
            .map((source) => source.relativePath)
            .join(", ") ?? "None ready"}
        </strong>
        {!chat.attached && chat.conversation && (
          <div className="chat-detached">
            Viewing:{" "}
            {chat.conversation.contextIdentity.sources
              .map((source) => source.relativePath)
              .join(", ")}
            <button
              disabled={chat.busy}
              onClick={() => {
                chat.resume();
                focusComposer();
              }}
            >
              Resume with this source
            </button>
          </div>
        )}
        {chat.unavailableReason && <p>{chat.unavailableReason}</p>}
        {chat.unavailableReason?.includes("changed") && (
          <button
            disabled={chat.busy}
            onClick={async () => {
              if (
                await confirm(
                  "Approve the current file version? A new conversation will use the changed source.",
                  "Approve updated source",
                )
              )
                chat.refreshSource();
            }}
          >
            Approve updated source
          </button>
        )}
      </div>
      <ConversationHistory chat={chat} onCompose={focusComposer} />
      <div
        className="chat-thread"
        ref={threadRef}
        aria-live="polite"
        onScroll={() => {
          const node = threadRef.current;
          if (node)
            followTail.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 45;
        }}
      >
        {!messages.length && (
          <p className="chat-message-system">
            Ask a question about the approved Markdown source.
          </p>
        )}
        {transcript.map(({ message, modelChanged, attempt }) => (
          <article
            key={message.id}
            className={`chat-message chat-message-${message.role}`}
          >
            {modelChanged && (
              <div className="chat-model-boundary">
                Model changed to{" "}
                {message.provider === "gemini" || message.provider === "nvidia"
                  ? `ONLINE · ${message.provider === "nvidia" ? "NVIDIA NIM" : "Gemini"}`
                  : "LOCAL · Ollama"}{" "}
                · {message.model}
              </div>
            )}
            <span className="chat-message-role">
              {message.role === "user" ? "YOU" : "WONNYY"}
            </span>
            <p>{message.content}</p>
            {attempt &&
              ["failed", "cancelled", "interrupted"].includes(
                attempt.status,
              ) && (
                <span className="chat-run-id" title={attempt.error?.message}>
                  {attempt.status === "cancelled"
                    ? "Response stopped"
                    : attempt.status === "interrupted"
                      ? "Response interrupted"
                      : "Response failed"}
                </span>
              )}
            {message.sources?.length ? (
              <div className="chat-sources">
                <span>SOURCE</span>
                {message.sources.map((source) => (
                  <button
                    key={source.sourceId}
                    title={`SHA-256 ${source.contentHash}`}
                    onClick={() => onOpenSource(source.relativePath)}
                  >
                    {source.relativePath}
                  </button>
                ))}
              </div>
            ) : null}
            {message.runId && (
              <span className="chat-run-id">
                RUN {message.runId.slice(0, 8)} · {message.model}
              </span>
            )}
          </article>
        ))}
        {chat.runtime.requestId && (
          <article
            className="chat-message chat-message-assistant"
            aria-label="Provisional response"
          >
            <span className="chat-message-role">
              {chat.runtime.content ? "WONNYY · IN PROGRESS" : statusLabel}
            </span>
            <p>{chat.runtime.content || "Preparing your response…"}</p>
          </article>
        )}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <textarea
          ref={composerRef}
          value={chat.draft}
          maxLength={8000}
          rows={2}
          onChange={(event) => chat.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            )
              return;
            event.preventDefault();
            if (!chat.busy) event.currentTarget.form?.requestSubmit();
          }}
          placeholder="Ask about Active Context…"
          aria-label="Chat question"
        />
        {chat.runtime.requestId ? (
          <button
            type="button"
            className="chat-stop"
            onClick={chat.stop}
            disabled={chat.runtime.state === "CANCELLING"}
            aria-label="Stop response"
          >
            ■
          </button>
        ) : (
          <button
            type="submit"
            disabled={chat.busy || !chat.draft.trim()}
            aria-label="Send message"
          >
            ↑
          </button>
        )}
      </form>
      {error && (
        <div className="chat-notice chat-error" role="alert">
          <span>{error}</span>
          {latest &&
            ["failed", "cancelled", "interrupted"].includes(latest.status) && (
              <button
                onClick={chat.retry}
                disabled={chat.busy || !chat.attached}
              >
                Retry
              </button>
            )}
        </div>
      )}
      {isFloating && !isMinimized && (
        <div
          className="chat-resize-handle"
          role="separator"
          aria-label="Resize chat window"
          aria-orientation="horizontal"
          onPointerDown={startResize}
          onPointerMove={resize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
        />
      )}
      {confirmation}
    </aside>
  );
}
