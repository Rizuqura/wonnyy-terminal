/** Purpose: validate isolated chat input/history. Inputs: IPC request/conversation; outputs: messages and requirements.
 * Dependencies: boundary schemas/token estimator. Failure: malformed/oversize input. Knobs: configured output/budget. Owner: backend. */
const { parse, requestSchema } = require("./experiment-contracts.cjs");
const { estimateTokens } = require("../history-budget.cjs");
const { ModelRuntimeError } = require("../model-errors.cjs");

/** Validate input before any provider call; no context, persona, tools or hidden system prompt is added. */
function normalizeRequest(value) {
  return parse(requestSchema, value);
}
/** Include every successful exchange, rejecting malformed pairings rather than silently truncating. */
function conversationMessages(conversation, question) {
  const messages = [];
  for (const assistant of conversation.messages.filter(
    (m) => m.role === "assistant",
  )) {
    const user = conversation.messages.find(
      (m) => m.id === assistant.userMessageId && m.role === "user",
    );
    if (!user)
      throw new ModelRuntimeError(
        "MODEL_STORAGE_INVALID",
        "Experimental chat history contains an unpaired answer.",
      );
    messages.push(
      { role: "user", content: user.content },
      { role: "assistant", content: assistant.content },
    );
  }
  messages.push({ role: "user", content: question });
  if (
    messages.length > 128 ||
    messages.reduce((n, m) => n + m.content.length, 0) > 2000000
  )
    throw new ModelRuntimeError(
      "MODEL_CONTEXT_TOO_LARGE",
      "The complete experiment history exceeds the local request limit. Start a new experimental conversation; nothing was dropped.",
    );
  return messages;
}
/** Deterministic requirements only: explicit task/format and configured policy, with unknown facts left null. */
function buildRequirements(request, messages, config, selectedDeploymentId) {
  return {
    taskType: request.task,
    transport: request.transport ?? "direct",
    requiredModalities: ["text"],
    needsTools: false,
    requiresJsonSchema: config.generation.format === "json",
    expectedInputTokens: estimateTokens(messages),
    reservedOutputTokens: config.generation.maxOutputTokens,
    minimumReliability: null,
    costCap: config.budget.maxEstimatedUsd,
    latencyTarget: null,
    userModelOverride:
      config.routing.mode === "manual" ? selectedDeploymentId : null,
    routingPolicy: config.routing.priority,
    historyMessages: messages.length - 1,
  };
}
module.exports = { normalizeRequest, conversationMessages, buildRequirements };
