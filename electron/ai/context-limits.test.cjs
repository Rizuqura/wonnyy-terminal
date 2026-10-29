const test = require("node:test");
const assert = require("node:assert/strict");
const { contextLimit } = require("./context-limits.cjs");
const {
  DEFAULTS,
  ModelRegistry,
  validateSettings,
} = require("./model-registry.cjs");
const { ProviderRegistry } = require("./provider-registry.cjs");
const { budgetHistory } = require("./history-budget.cjs");

test("context limits respect metadata, unknown capacity, and local memory ceiling", () => {
  assert.equal(contextLimit("openrouter", 1048576), 1048576);
  assert.equal(contextLimit("gemini", 9999999), 2097152);
  assert.equal(contextLimit("nvidia", 16384), 16384);
  for (const capacity of [undefined, null, NaN, Infinity, -1, 0])
    assert.equal(contextLimit("openrouter", capacity), 32768);
  assert.equal(contextLimit("ollama", 131072), 32768);
  assert.throws(() => validateSettings({ ...DEFAULTS, contextWindow: 65536 }));
});

test("remote selection permits larger windows only with provider capacity", async () => {
  let capacity = 131072;
  const provider = {
    listModels: async () => [{ name: "test", contextLength: capacity }],
  };
  const registry = new ModelRegistry(
    new ProviderRegistry({ openrouter: provider }),
    ".",
  );
  const settings = {
    ...DEFAULTS,
    providerId: "openrouter",
    modelId: "test",
    contextWindow: 65536,
    outputLimit: 8000,
  };
  assert.equal(
    (await registry.validateSelection(settings)).contextWindow,
    65536,
  );
  capacity = 32768;
  await assert.rejects(registry.validateSelection(settings), {
    code: "MODEL_CONTEXT_TOO_LARGE",
  });
  capacity = undefined;
  await assert.rejects(registry.validateSelection(settings), {
    code: "MODEL_CONTEXT_TOO_LARGE",
  });
});

test("reported 35076-token request fits 64K intact and reports exact minimum at 32K", () => {
  const messages = [{ role: "user", content: "x".repeat((35076 - 12) * 3) }];
  const settings = {
    ...DEFAULTS,
    providerId: "openrouter",
    modelId: "test",
    contextWindow: 32768,
    outputLimit: 8000,
  };
  assert.throws(
    () => budgetHistory(messages, [], settings),
    (error) => {
      assert.equal(error.code, "MODEL_CONTEXT_TOO_LARGE");
      assert.equal(error.details.requiredContextWindow, 43332);
      assert.match(error.message, /43332/);
      return true;
    },
  );
  assert.equal(
    budgetHistory(messages, [], { ...settings, contextWindow: 65536 })
      .diagnostics.estimatedPromptTokens,
    35076,
  );
  assert.equal(messages[0].content.length, (35076 - 12) * 3);
});
