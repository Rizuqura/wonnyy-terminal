const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  readJson,
  writeJson,
  serialQueue,
  safeDirectory,
  rejectSymlink,
} = require("./json-store.cjs");
const { ModelRuntimeError } = require("./model-errors.cjs");
const { validateContextIdentity } = require("./context-identity.cjs");

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
function validId(id) {
  if (typeof id !== "string" || !ID.test(id))
    throw new ModelRuntimeError(
      "MODEL_INVALID_REQUEST",
      "Invalid conversation or request identifier.",
    );
  return id;
}

function validateConversation(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !ID.test(value.id) ||
    typeof value.title !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    !/^[a-f0-9]{64}$/.test(value.contextIdentity?.id ?? "") ||
    value.contextIdentity.mode !== "active-context" ||
    !value.contextIdentity.sources?.length ||
    !Array.isArray(value.messages) ||
    !Array.isArray(value.attempts)
  )
    throw new Error("Invalid conversation schema.");
  const source = value.contextIdentity.sources[0];
  validateContextIdentity(value.contextIdentity);
  if (
    typeof source.sourceId !== "string" ||
    typeof source.relativePath !== "string" ||
    !/^[a-f0-9]{64}$/.test(source.contentHash)
  )
    throw new Error("Invalid conversation source.");
  for (const message of value.messages) {
    if (
      !ID.test(message.id) ||
      message.conversationId !== value.id ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      !Number.isFinite(Date.parse(message.createdAt))
    )
      throw new Error("Invalid conversation message.");
  }
  for (const attempt of value.attempts) {
    if (
      !ID.test(attempt.requestId) ||
      !ID.test(attempt.runId) ||
      !value.messages.some(
        (message) =>
          message.id === attempt.userMessageId && message.role === "user",
      ) ||
      !["pending", "succeeded", "failed", "cancelled", "interrupted"].includes(
        attempt.status,
      )
    )
      throw new Error("Invalid conversation attempt.");
  }
  if (
    new Set(value.messages.map((item) => item.id)).size !==
      value.messages.length ||
    new Set(value.attempts.map((item) => item.requestId)).size !==
      value.attempts.length ||
    new Set(value.attempts.map((item) => item.runId)).size !==
      value.attempts.length
  )
    throw new Error("Duplicate conversation identifiers.");
  for (const message of value.messages.filter(
    (item) => item.role === "assistant",
  )) {
    if (
      typeof message.model !== "string" ||
      (message.provider !== undefined &&
        !["ollama", "gemini", "nvidia"].includes(message.provider)) ||
      !value.attempts.some(
        (attempt) =>
          attempt.runId === message.runId &&
          attempt.status === "succeeded" &&
          attempt.userMessageId === message.userMessageId,
      ) ||
      JSON.stringify(message.sources) !==
        JSON.stringify(value.contextIdentity.sources)
    )
      throw new Error(
        "Assistant message provenance does not match its conversation.",
      );
  }
  return structuredClone(value);
}

function applyRun(conversation, attempt, record) {
  attempt.status = record.status;
  attempt.error = record.error;
  if (
    record.status === "succeeded" &&
    !conversation.messages.some((message) => message.runId === record.runId)
  ) {
    conversation.messages.push({
      id: randomUUID(),
      conversationId: conversation.id,
      role: "assistant",
      content: record.response,
      createdAt: record.completedAt,
      runId: record.runId,
      userMessageId: attempt.userMessageId,
      sources: record.sourcesActuallyRead,
      model: record.model,
      provider: record.provider,
    });
  }
}

class ConversationStore {
  constructor(rootPath, readRun) {
    this.directory = path.join(rootPath, ".wonnyy", "conversations");
    this.readRun = readRun;
    this.queue = serialQueue();
  }
  file(id) {
    return path.join(this.directory, `${validId(id)}.json`);
  }
  async read(id) {
    await safeDirectory(this.directory);
    const value = await readJson(this.file(id), validateConversation);
    if (value.id !== id)
      throw new ModelRuntimeError(
        "MODEL_STORAGE_INVALID",
        "Conversation identity does not match its filename.",
      );
    return value;
  }
  async write(value) {
    await writeJson(this.file(value.id), validateConversation(value));
  }
  async list() {
    await safeDirectory(this.directory);
    const files = (await fs.readdir(this.directory)).filter((name) =>
      name.endsWith(".json"),
    );
    const conversations = await Promise.all(
      files.map((name) => this.read(name.slice(0, -5))),
    );
    return conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  create(contextIdentity) {
    return this.queue(async () => {
      const timestamp = new Date().toISOString();
      const value = {
        schemaVersion: 1,
        id: randomUUID(),
        title: path.basename(contextIdentity.sources[0].relativePath),
        createdAt: timestamp,
        updatedAt: timestamp,
        contextIdentity,
        messages: [],
        attempts: [],
      };
      await this.write(value);
      return value;
    });
  }
  update(id, operation) {
    return this.queue(async () => {
      const value = await this.read(id);
      await operation(value);
      value.updatedAt = new Date().toISOString();
      await this.write(value);
      return value;
    });
  }
  remove(id) {
    return this.queue(async () => {
      await this.read(id);
      await rejectSymlink(this.file(id));
      await fs.unlink(this.file(id));
    });
  }
  async recover() {
    // Only existing snapshots own recovery references. Deleted chats stay deleted.
    for (const value of await this.list()) {
      if (!value.attempts.some((attempt) => attempt.status === "pending"))
        continue;
      await this.update(value.id, async (conversation) => {
        for (const attempt of conversation.attempts.filter(
          (item) => item.status === "pending",
        )) {
          try {
            const run = await this.readRun(attempt.runId);
            if (
              run.conversationId !== conversation.id ||
              run.contextIdentity?.id !== conversation.contextIdentity.id
            )
              throw new ModelRuntimeError(
                "MODEL_STORAGE_INVALID",
                "Run does not belong to this conversation.",
              );
            applyRun(conversation, attempt, run);
          } catch (error) {
            if (error.code !== "MODEL_RUN_RECORD_NOT_FOUND") throw error;
            attempt.status = "interrupted";
            attempt.error = {
              code: "MODEL_INTERRUPTED",
              message:
                "The app closed before this response was recorded. Retry explicitly.",
              details: {},
            };
          }
        }
      });
    }
  }
}

module.exports = { ConversationStore, validateConversation, validId, applyRun };
