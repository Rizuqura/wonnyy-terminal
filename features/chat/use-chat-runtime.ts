"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type {
  AiBridge,
  Conversation,
  ContextIdentity,
  ModelSettings,
  ModelCheckResult,
  RegistryState,
  ScopeSelection,
  ChatState,
} from "../../types/ai";
import { connectAi } from "./desktop-client";
import { initialRuntime, runtimeReducer } from "./runtime-state";
import { chatErrorMessage } from "./context-readiness";

type Options = {
  vaultPath: string | null;
  contextKey: string;
  scope: ScopeSelection;
  unavailableReason: string | null;
  onKnowledgeChange: () => Promise<void>;
};
const errorState = (error: unknown): ChatState => {
  const code = (error as { code?: string })?.code;
  if (code === "MODEL_RESTART_REQUIRED") return "RESTART_REQUIRED";
  if (code === "MODEL_OFFLINE" || code === "PROVIDER_OFFLINE")
    return "MODEL_OFFLINE";
  if (code === "MODEL_NOT_FOUND" || code === "MODEL_UNAVAILABLE")
    return "MODEL_MISSING";
  return "ERROR";
};

export function useChatRuntime({
  vaultPath,
  contextKey,
  scope,
  unavailableReason,
  onKnowledgeChange,
}: Options) {
  const [runtime, dispatch] = useReducer(runtimeReducer, initialRuntime);
  const [draft, setDraft] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [context, setContext] = useState<ContextIdentity | null>(null);
  const [registry, setRegistry] = useState<RegistryState | null>(null);
  const [connected, setConnected] = useState(false);
  const [working, setWorking] = useState(false);
  const bridge = useRef<AiBridge | null>(null);
  const session = useRef(0);
  const request = useRef<string | null>(null);
  const selected = useRef<Conversation | null>(null);
  const chats = useRef<Conversation[]>([]);
  const scopeRef = useRef(scope);
  const mutation = useRef(false);
  const checksStopped = useRef(false);
  const checkedLoadedKeys = useRef(new Set<string>());
  const scanActive = useRef(false);
  const operationDone = useRef<Promise<void>>(Promise.resolve());
  scopeRef.current = scope;
  selected.current = conversation;
  chats.current = conversations;

  const fail = useCallback(
    (error: unknown) =>
      dispatch({
        type: "error",
        message: chatErrorMessage(error),
        state: errorState(error),
      }),
    [],
  );
  const accept = useCallback((value: Conversation) => {
    setConversation(value);
    setConversations((current) => [
      value,
      ...current.filter((item) => item.id !== value.id),
    ]);
  }, []);

  useEffect(() => {
    const version = ++session.current;
    setConnected(false);
    setConversation(null);
    setConversations([]);
    setContext(null);
    setDraft("");
    dispatch({ type: "reset" });
    let unsubscribe: (() => void) | undefined;
    void connectAi()
      .then(async (client) => {
        if (session.current !== version) return;
        bridge.current = client;
        unsubscribe = client.onEvent((event) => {
          if (
            session.current !== version ||
            event.requestId !== request.current
          )
            return;
          dispatch({ type: "event", event });
          if (event.conversation) accept(event.conversation);
        });
        const [models, list] = await Promise.all([
          client.models(),
          vaultPath ? client.listConversations() : Promise.resolve([]),
        ]);
        if (session.current !== version) return;
        setRegistry(models);
        setConversations(list);
        chats.current = list;
        setConnected(true);
      })
      .catch((error) => {
        if (session.current === version) fail(error);
      });
    return () => {
      session.current++;
      checksStopped.current = true;
      void bridge.current?.stopModelChecks().catch(() => {});
      unsubscribe?.();
      if (request.current)
        void bridge.current?.cancel(request.current).catch(() => {});
      request.current = null;
    };
  }, [vaultPath, accept, fail]);

  useEffect(() => {
    if (!connected || !bridge.current) return;
    let stale = false;
    const client = bridge.current;
    setContext(null);
    void (async () => {
      if (request.current) await client.cancel(request.current);
      if (stale) return;
      if (unavailableReason) {
        dispatch({ type: "reset", state: "CONTEXT_NEEDED" });
        return;
      }
      dispatch({ type: "reset", state: "PREPARING_CONTEXT" });
      const identity = await client.context(scopeRef.current);
      if (stale) return;
      const current = selected.current;
      const compatible =
        current?.contextIdentity.id === identity.id
          ? current
          : !current
            ? chats.current.find(
                (item) => item.contextIdentity.id === identity.id,
              )
            : null;
      const next =
        compatible ?? (await client.createConversation(scopeRef.current));
      if (stale) return;
      setContext(identity);
      accept(next);
      dispatch({ type: "reset", state: "READY" });
    })().catch((error) => {
      if (!stale) fail(error);
    });
    return () => {
      stale = true;
    };
  }, [connected, contextKey, unavailableReason, accept, fail]);

  const interruptChecks = useCallback(async () => {
    if (!scanActive.current) return;
    checksStopped.current = true;
    checkedLoadedKeys.current.add("gemini");
    checkedLoadedKeys.current.add("nvidia");
    await bridge.current?.stopModelChecks().catch(() => {});
    await operationDone.current;
  }, []);
  const operate = useCallback(
    async (
      operation: (client: AiBridge, current: () => boolean) => Promise<void>,
    ) => {
      await interruptChecks();
      if (!bridge.current || mutation.current || request.current) return;
      const version = session.current;
      mutation.current = true;
      let release!: () => void;
      operationDone.current = new Promise<void>((resolve) => {
        release = resolve;
      });
      setWorking(true);
      try {
        await operation(bridge.current, () => version === session.current);
      } catch (error) {
        if (version === session.current) fail(error);
      } finally {
        mutation.current = false;
        setWorking(false);
        release();
      }
    },
    [fail, interruptChecks],
  );

  const attached = Boolean(
    context && conversation?.contextIdentity.id === context.id,
  );
  const run = useCallback(
    async (text: string, retryOf?: string) => {
      await interruptChecks();
      if (request.current || mutation.current || !text.trim()) return;
      if (
        !bridge.current ||
        !conversation ||
        !context ||
        !attached ||
        unavailableReason
      ) {
        fail(
          new Error(
            unavailableReason ??
              "Resume this chat's approved source or start a new chat first.",
          ),
        );
        return;
      }
      const client = bridge.current;
      const requestId = crypto.randomUUID();
      const version = session.current;
      request.current = requestId;
      dispatch({ type: "start", requestId });
      setDraft("");
      try {
        const result = await client.chat({
          ...scopeRef.current,
          conversationId: conversation.id,
          expectedContextId: context.id,
          requestId,
          userMessage: text,
          ...(retryOf ? { retryOf } : {}),
        });
        if (version === session.current) accept(result.conversation);
      } catch (error) {
        if (version === session.current) {
          fail(error);
          setDraft((current) => current || text);
          try {
            const list = await client.listConversations();
            if (version === session.current) {
              setConversations(list);
              setConversation(
                list.find((item) => item.id === conversation.id) ?? null,
              );
            }
          } catch (loadError) {
            if (version === session.current) fail(loadError);
          }
        }
      } finally {
        if (request.current === requestId) request.current = null;
        if (version === session.current) dispatch({ type: "finish" });
      }
    },
    [
      conversation,
      context,
      attached,
      unavailableReason,
      accept,
      fail,
      interruptChecks,
    ],
  );

  const stop = useCallback(() => {
    if (!request.current) return;
    const version = session.current;
    dispatch({ type: "stop" });
    void bridge.current?.cancel(request.current).catch((error) => {
      if (version === session.current) fail(error);
    });
  }, [fail]);

  const latest = conversation?.attempts.at(-1);
  const retry = () => {
    if (
      !latest ||
      !["failed", "cancelled", "interrupted"].includes(latest.status)
    )
      return;
    const message = conversation?.messages.find(
      (item) => item.id === latest.userMessageId,
    );
    if (message) void run(message.content, latest.requestId);
  };
  const newChat = () =>
    void operate(async (client, current) => {
      if (unavailableReason) throw new Error(unavailableReason);
      const value = await client.createConversation(scopeRef.current);
      if (!current()) return;
      accept(value);
      dispatch({ type: "reset", state: "READY" });
    });
  const selectChat = (id: string) => {
    if (request.current || mutation.current) return;
    const value = conversations.find((item) => item.id === id);
    if (value) {
      setConversation(value);
      dispatch({ type: "reset", state: "READY" });
    }
  };
  const resume = () =>
    void operate(async (client, current) => {
      if (!conversation) return;
      const value = await client.resumeConversation(conversation.id);
      if (!current()) return;
      accept(value);
      setContext(value.contextIdentity);
      await onKnowledgeChange();
    });
  const refreshSource = () =>
    void operate(async (client, current) => {
      await client.refreshSource();
      if (!current()) return;
      await onKnowledgeChange();
    });
  const rename = (title: string) =>
    void operate(async (client, current) => {
      if (conversation) {
        const value = await client.renameConversation({
          conversationId: conversation.id,
          title,
        });
        if (current()) accept(value);
      }
    });
  const remove = (all: boolean) =>
    void operate(async (client, current) => {
      if (all) await client.clearConversations();
      else if (conversation) await client.deleteConversation(conversation.id);
      if (!current()) return;
      const list = await client.listConversations();
      if (!current()) return;
      setConversations(list);
      setConversation(null);
      dispatch({ type: "reset", state: "READY" });
    });
  const refreshModels = () =>
    void operate(async (client, current) => {
      const value = await client.models();
      if (current()) {
        setRegistry(value);
        if (!value.error) dispatch({ type: "reset", state: "READY" });
      }
    });
  const saveSettings = (settings: Partial<ModelSettings>) =>
    void operate(async (client, current) => {
      await client.settings(settings);
      if (!current()) return;
      const value = await client.models();
      if (current()) {
        setRegistry(value);
        dispatch({ type: "reset", state: "READY" });
      }
    });
  const [modelChecks, setModelChecks] = useState<
    Record<string, ModelCheckResult>
  >({});
  const [modelScan, setModelScan] = useState<{
    providerId: "gemini" | "nvidia";
    running: boolean;
    completed: number;
    total: number;
    model: string | null;
    note: string;
  } | null>(null);
  const clearChecks = (providerId: "gemini" | "nvidia") =>
    setModelChecks((checks) =>
      Object.fromEntries(
        Object.entries(checks).filter(
          ([, result]) => result.providerId !== providerId,
        ),
      ),
    );
  const scanModels = async (
    client: AiBridge,
    current: () => boolean,
    providerId: "gemini" | "nvidia",
    models: string[],
    clear = true,
  ) => {
    checksStopped.current = false;
    scanActive.current = true;
    if (clear) clearChecks(providerId);
    let completed = 0;
    let note =
      "Checks complete. Stars indicate a successful sample, not guaranteed availability.";
    setModelScan({
      providerId,
      running: true,
      completed,
      total: models.length,
      model: null,
      note: "",
    });
    try {
      for (const model of models) {
        if (!current() || checksStopped.current) break;
        setModelScan({
          providerId,
          running: true,
          completed,
          total: models.length,
          model,
          note: "",
        });
        const result = await client.checkRemoteModel({ providerId, model });
        if (!current() || checksStopped.current) break;
        completed++;
        setModelChecks((checks) => ({
          ...checks,
          [providerId + "/" + model]: result,
        }));
        if (
          ["RATE_LIMITED", "AUTH_INVALID", "AUTH_REQUIRED"].includes(
            result.code ?? "",
          )
        ) {
          note = "Checks paused: " + result.message;
          break;
        }
        if (completed < models.length)
          await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      note = "Checks interrupted. Remaining models are untested.";
      throw error;
    } finally {
      scanActive.current = false;
      if (checksStopped.current)
        note = "Checks stopped. Remaining models are untested.";
      setModelScan({
        providerId,
        running: false,
        completed,
        total: models.length,
        model: null,
        note,
      });
    }
  };
  const stopModelChecks = () => {
    checksStopped.current = true;
    registry?.providers.forEach((provider) =>
      checkedLoadedKeys.current.add(provider.id),
    );
    void bridge.current?.stopModelChecks().catch(fail);
  };
  const recheckModels = (providerId: "gemini" | "nvidia") =>
    operate(async (client, current) => {
      checkedLoadedKeys.current.add(providerId);
      const value = await client.models();
      if (!current()) return;
      setRegistry(value);
      await scanModels(
        client,
        current,
        providerId,
        value.models
          .filter((m) => m.providerId === providerId)
          .map((m) => m.modelId),
      );
    });
  const checkModel = (providerId: "gemini" | "nvidia", model: string) =>
    operate((client, current) =>
      scanModels(client, current, providerId, [model], false),
    );
  const saveCredential = (
    apiKey: string,
    providerId: "gemini" | "nvidia" = "gemini",
  ) =>
    operate(async (client, current) => {
      await client.saveCredential({ providerId, apiKey });
      checkedLoadedKeys.current.add(providerId);
      if (!current()) return;
      clearChecks(providerId);
      const value = await client.models();
      if (!current()) return;
      setRegistry(value);
      dispatch({ type: "reset", state: "READY" });
      await scanModels(
        client,
        current,
        providerId,
        value.models
          .filter((m) => m.providerId === providerId)
          .map((m) => m.modelId),
      );
    });
  const removeCredential = (providerId: "gemini" | "nvidia" = "gemini") =>
    operate(async (client, current) => {
      await client.removeCredential({ providerId });
      checkedLoadedKeys.current.delete(providerId);
      if (!current()) return;
      clearChecks(providerId);
      setModelScan(null);
      const value = await client.models();
      if (current()) {
        setRegistry(value);
        dispatch({ type: "reset", state: "READY" });
      }
    });
  useEffect(() => {
    // Check stored credentials once per mounted workspace, after startup context
    // preparation. A stopped/limited scan is resumed only by an explicit recheck.
    if (
      !connected ||
      working ||
      mutation.current ||
      request.current ||
      !["READY", "CONTEXT_NEEDED"].includes(runtime.state) ||
      !registry
    )
      return;
    const provider = registry.providers.find(
      (p) =>
        p.id !== "ollama" &&
        p.configured &&
        p.online &&
        !checkedLoadedKeys.current.has(p.id),
    );
    if (!provider || provider.id === "ollama") return;
    const providerId = provider.id;
    checkedLoadedKeys.current.add(providerId);
    void operate((client, current) =>
      scanModels(
        client,
        current,
        providerId,
        registry.models
          .filter((m) => m.providerId === providerId)
          .map((m) => m.modelId),
      ),
    );
  }, [connected, working, runtime.state, registry]);

  const selectedModelAvailable = registry?.models.some(
    (model) =>
      model.providerId === registry.settings.providerId &&
      model.modelId === registry.settings.modelId,
  );
  const status =
    runtime.state === "READY" && !registry?.online
      ? "MODEL_OFFLINE"
      : runtime.state === "READY" && !selectedModelAvailable
        ? "MODEL_MISSING"
        : runtime.state;

  return {
    runtime: { ...runtime, state: status as ChatState },
    draft,
    setDraft,
    conversation,
    conversations,
    context,
    registry,
    attached,
    busy: Boolean(runtime.requestId) || (working && !modelScan?.running),
    unavailableReason,
    submit: () => void run(draft),
    retry,
    stop,
    newChat,
    selectChat,
    resume,
    rename,
    remove,
    refreshSource,
    refreshModels,
    saveSettings,
    saveCredential,
    modelChecks,
    modelScan,
    checkModel,
    recheckModels,
    stopModelChecks,
    removeCredential,
  };
}

export type ChatController = ReturnType<typeof useChatRuntime>;
