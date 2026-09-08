const { ModelRuntimeError } = require("./model-errors.cjs");

// Conservative estimate, including message framing. No source is truncated.
const estimateTokens = (messages) =>
  messages.reduce(
    (sum, message) =>
      sum + Math.ceil(Buffer.byteLength(message.content, "utf8") / 3) + 12,
    0,
  );

function budgetHistory(baseMessages, history, settings) {
  const available = settings.contextWindow - settings.outputLimit - 256;
  const baseTokens = estimateTokens(baseMessages);
  if (baseTokens > available)
    throw new ModelRuntimeError(
      "MODEL_CONTEXT_TOO_LARGE",
      "The approved source and question do not fit the selected model limits. Increase the context window or approve a smaller source.",
      { estimatedTokens: baseTokens, available },
    );
  const exchanges = [];
  for (let index = 0; index + 1 < history.length; index += 2) {
    if (
      history[index].role === "user" &&
      history[index + 1].role === "assistant"
    )
      exchanges.push(history.slice(index, index + 2));
  }
  const kept = exchanges.slice(-12);
  while (kept.length && baseTokens + estimateTokens(kept.flat()) > available)
    kept.shift();
  return {
    history: kept.flat(),
    diagnostics: {
      estimatedPromptTokens: baseTokens + estimateTokens(kept.flat()),
      droppedExchanges: exchanges.length - kept.length,
      estimateMethod: "utf8-bytes/3 + framing",
    },
  };
}

module.exports = { budgetHistory, estimateTokens };
