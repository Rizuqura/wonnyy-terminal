const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const stations = require("../station-service.cjs");
const {
  ConversationStore,
  validId,
  applyRun,
} = require("./conversation-store.cjs");
const { createContextOrchestrator } = require("./orchestrator.cjs");
const { contextIdentity } = require("./context-identity.cjs");
const { createModelRun, readModelRun } = require("./run-store.cjs");
const {
  ModelRuntimeError,
  serializeModelError,
} = require("./model-errors.cjs");
const { validateUserMessage } = require("./prompt-builder.cjs");

function assertFields(value, fields) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw new ModelRuntimeError(
      "MODEL_INVALID_REQUEST",
      "Unsupported chat request fields. Restart the desktop application if it was updated.",
    );
}

class ChatService {
  constructor({ provider, registry, knowledge = stations }) {
    this.provider = provider;
    this.registry = registry;
    this.knowledge = knowledge;
    this.stores = new Map();
    this.active = null;
    this.pendingMutations = 0;
    this.mutationTail = Promise.resolve();
  }
  async store(vault) {
    const root = await fs.realpath(vault);
    if (!this.stores.has(root)) {
      const loading = (async () => {
        const store = new ConversationStore(root, (id) =>
          readModelRun(root, id),
        );
        await store.recover();
        return { root, store };
      })();
      this.stores.set(root, loading);
      loading.catch(() => this.stores.delete(root));
    }
    return this.stores.get(root);
  }
  assertIdle() {
    if (this.active || this.pendingMutations)
      throw new ModelRuntimeError(
        "MODEL_BUSY",
        "Wait for the current operation or stop the response before changing models or conversations.",
      );
  }
  async exclusive(operation) {
    this.assertIdle();
    return this.queueMutation(operation);
  }
  queueMutation(operation) {
    // Reserve admission immediately, including while waiting for another write
    // or vault scan. A rejected operation must not poison subsequent changes.
    this.pendingMutations++;
    const result = this.mutationTail.then(async () => {
      try {
        return await operation();
      } finally {
        this.pendingMutations--;
      }
    });
    this.mutationTail = result.catch(() => {});
    return result;
  }
  changeKnowledge(operation) {
    return this.queueMutation(async () => {
      await this.cancelAll();
      return await operation();
    });
  }
  async cancel(ownerId, requestId) {
    const active = this.active;
    if (
      !active ||
      active.ownerId !== ownerId ||
      (requestId && requestId !== active.requestId)
    )
      return false;
    active.controller.abort(
      new ModelRuntimeError("MODEL_CANCELLED", "The response was stopped."),
    );
    await active.finished;
    return true;
  }
  async cancelAll() {
    const active = this.active;
    if (active) await this.cancel(active.ownerId, active.requestId);
  }
  async context(vault, scopeInput) {
    assertFields(scopeInput, ["activeStationIds", "matchMode"]);
    const scope = await this.knowledge.prepareBrainScope(vault, {
      ...scopeInput,
      ownerId: `context:${randomUUID()}`,
    });
    return contextIdentity(scope);
  }
  async list(vault) {
    return (await this.store(vault)).store.list();
  }
  async create(vault, input) {
    return this.exclusive(async () => {
      const { root, store } = await this.store(vault);
      return store.create(await this.context(root, input));
    });
  }
  async rename(vault, input) {
    assertFields(input, ["conversationId", "title"]);
    if (
      typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 120
    )
      throw new ModelRuntimeError(
        "MODEL_INVALID_REQUEST",
        "Use a chat title between 1 and 120 characters.",
      );
    return this.exclusive(async () =>
      (await this.store(vault)).store.update(input.conversationId, (value) => {
        value.title = input.title.trim();
      }),
    );
  }
  async remove(vault, id) {
    return this.exclusive(async () =>
      (await this.store(vault)).store.remove(id),
    );
  }
  async clear(vault) {
    return this.exclusive(async () => {
      const { store } = await this.store(vault);
      for (const conversation of await store.list())
        await store.remove(conversation.id);
    });
  }
  async resume(vault, id) {
    return this.exclusive(async () => {
      const { root, store } = await this.store(vault);
      const conversation = await store.read(id);
      await this.knowledge.approveChatSource(
        root,
        conversation.contextIdentity.sources.length === 1
          ? conversation.contextIdentity.sources[0]
          : conversation.contextIdentity.sources,
      );
      return conversation;
    });
  }
  async refreshSource(vault) {
    return this.exclusive(async () =>
      this.knowledge.refreshChatSource((await this.store(vault)).root),
    );
  }
  async run(vault, ownerId, input, sendEvent = () => {}) {
    assertFields(input, [
      "conversationId",
      "requestId",
      "userMessage",
      "expectedContextId",
      "activeStationIds",
      "matchMode",
      "retryOf",
    ]);
    validId(input.requestId);
    validId(input.conversationId);
    const question = validateUserMessage(input.userMessage);
    this.assertIdle();
    let finish;
    const active = {
      ownerId,
      requestId: input.requestId,
      controller: new AbortController(),
      finished: new Promise((resolve) => {
        finish = resolve;
      }),
    };
    this.active = active;
    const runId = randomUUID();
    const emit = (event) =>
      sendEvent({
        ...event,
        requestId: input.requestId,
        conversationId: input.conversationId,
        runId,
      });
    let timer;
    let store;
    let root;
    let pending = false;
    let committed = false;
    try {
      ({ root, store } = await this.store(vault));
      let conversation = await store.read(input.conversationId);
      const previous = conversation.attempts.find(
        (attempt) => attempt.requestId === input.requestId,
      );
      if (previous) {
        const original = conversation.messages.find(
          (message) => message.id === previous.userMessageId,
        );
        if (original.content !== question)
          throw new ModelRuntimeError(
            "MODEL_INVALID_REQUEST",
            "Request IDs cannot be reused for different messages.",
          );
        if (previous.status === "pending")
          throw new ModelRuntimeError(
            "MODEL_BUSY",
            "This request is already pending.",
          );
        return {
          conversation,
          run:
            previous.status === "interrupted"
              ? null
              : await readModelRun(root, previous.runId),
        };
      }
      const identity = await this.context(root, {
        activeStationIds: input.activeStationIds,
        matchMode: input.matchMode,
      });
      if (
        identity.id !== input.expectedContextId ||
        identity.id !== conversation.contextIdentity.id
      )
        throw new ModelRuntimeError(
          "MODEL_CONTEXT_INVALID",
          "This chat belongs to a different approved source version. Start a new chat or explicitly resume its source.",
        );
      const settings = await this.registry.read();
      active.controller.signal.throwIfAborted();
      timer = setTimeout(
        () =>
          active.controller.abort(
            new ModelRuntimeError(
              "MODEL_TIMEOUT",
              "The absolute run time limit was exceeded.",
            ),
          ),
        settings.absoluteTimeoutMs,
      );
      await this.registry.validateSelection(settings, {
        signal: active.controller.signal,
      });
      const history = [];
      for (const answer of conversation.messages.filter(
        (message) => message.role === "assistant",
      )) {
        const user = conversation.messages.find(
          (message) => message.id === answer.userMessageId,
        );
        if (user)
          history.push(
            { role: "user", content: user.content },
            { role: "assistant", content: answer.content },
          );
      }
      let userMessageId = randomUUID();
      // Only backend-owned successful runs from this exact approved snapshot
      // may contribute analytical memory. Recompute their queries below.
      const datasetHistory = [];
      for (const answer of conversation.messages
        .filter((message) => message.role === "assistant")
        .slice(-2)) {
        if (!answer.runId) continue;
        const previous = await readModelRun(root, answer.runId);
        if (
          previous?.status === "succeeded" &&
          previous.contextIdentity?.id === identity.id &&
          previous.diagnostics?.datasetAnalysis?.queries
        ) {
          datasetHistory.push({
            runId: previous.runId,
            contextIdentityId: identity.id,
            question: previous.userMessage,
            queries: previous.diagnostics.datasetAnalysis.queries,
          });
        }
      }
      if (input.retryOf) {
        const failed = conversation.attempts.find(
          (attempt) => attempt.requestId === input.retryOf,
        );
        if (
          !failed ||
          !["failed", "cancelled", "interrupted"].includes(failed.status) ||
          conversation.messages.find(
            (message) => message.id === failed.userMessageId,
          )?.content !== question ||
          conversation.attempts.at(-1) !== failed
        )
          throw new ModelRuntimeError(
            "MODEL_INVALID_REQUEST",
            "Only the latest failed turn can be retried.",
          );
        userMessageId = failed.userMessageId;
      }
      conversation = await store.update(conversation.id, (value) => {
        if (!input.retryOf)
          value.messages.push({
            id: userMessageId,
            conversationId: value.id,
            role: "user",
            content: question,
            createdAt: new Date().toISOString(),
          });
        value.attempts.push({
          requestId: input.requestId,
          runId,
          userMessageId,
          status: "pending",
          error: null,
        });
      });
      pending = true;
      emit({ state: "PREPARING_CONTEXT", conversation });
      const orchestrator = createContextOrchestrator({
        prepareScope: (scope) => this.knowledge.prepareBrainScope(root, scope),
        readSource: (source) => this.knowledge.readBrainSource(root, source),
        provider:
          this.registry.providerFor?.(settings.providerId) ?? this.provider,
        providerName: settings.providerId,
        recordRun: (record) => createModelRun(root, record),
      });
      await orchestrator.run(
        {
          model: settings.modelId,
          userMessage: question,
          history: history.slice(-24),
          activeStationIds: input.activeStationIds,
          matchMode: input.matchMode,
        },
        {
          runId,
          requestId: input.requestId,
          conversationId: conversation.id,
          contextIdentity: identity,
          datasetHistory,
          earlierExchangesDropped: Math.max(0, history.length / 2 - 12),
          settings,
          prepareModel: true,
          signal: active.controller.signal,
          onEvent: emit,
        },
      );
      committed = true;
      const run = await readModelRun(root, runId);
      conversation = await store.update(conversation.id, (value) =>
        applyRun(
          value,
          value.attempts.find((attempt) => attempt.runId === runId),
          run,
        ),
      );
      emit({ state: "READY", conversation, diagnostics: run.diagnostics });
      return { conversation, run };
    } catch (error) {
      if (pending && !committed) {
        // Preserve pending references if recording failed: restart recovery owns them.
        try {
          const record = await readModelRun(root, runId);
          await store.update(input.conversationId, (value) =>
            applyRun(
              value,
              value.attempts.find((attempt) => attempt.runId === runId),
              record,
            ),
          );
        } catch (recordError) {
          if (recordError.code !== "MODEL_RUN_RECORD_NOT_FOUND")
            error = recordError;
        }
      }
      if (active.controller.signal.aborted && !committed)
        error = active.controller.signal.reason;
      emit({ state: "ERROR", error: serializeModelError(error) });
      throw error;
    } finally {
      clearTimeout(timer);
      if (this.active === active) this.active = null;
      finish();
    }
  }
}

module.exports = { ChatService, assertFields };
