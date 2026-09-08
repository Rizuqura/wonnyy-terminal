const assert = require("node:assert/strict");
const test = require("node:test");
const { BrainScopeError } = require("../brain-errors.cjs");
const {
  ModelRuntimeError,
  serializeModelError,
} = require("./model-errors.cjs");

test("model IPC serialization preserves structured model and Brain Scope failures", () => {
  assert.deepEqual(
    serializeModelError(
      new ModelRuntimeError("MODEL_OFFLINE", "Offline", { endpoint: "local" }),
    ),
    {
      code: "MODEL_OFFLINE",
      message: "Offline",
      details: { endpoint: "local" },
    },
  );
  assert.deepEqual(
    serializeModelError(
      new BrainScopeError("BRAIN_SOURCE_CHANGED", "Changed", {
        sourceId: "note.md",
      }),
    ),
    {
      code: "BRAIN_SOURCE_CHANGED",
      message: "Changed",
      details: { sourceId: "note.md" },
    },
  );
  assert.equal(
    serializeModelError(new Error("Unexpected")).code,
    "MODEL_INTERNAL_ERROR",
  );
});
