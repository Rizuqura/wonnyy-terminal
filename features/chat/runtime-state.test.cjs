const test = require("node:test");
const assert = require("node:assert/strict");
const { runtimeReducer, initialRuntime } = require("./runtime-state.ts");

test("saved answer clears its streaming copy on READY", () => {
  const state = {
    ...initialRuntime,
    requestId: "run",
    state: "VALIDATING",
    content: "Answer",
  };
  const next = runtimeReducer(state, {
    type: "event",
    event: { requestId: "run", state: "READY" },
  });
  assert.equal(next.content, "");
  assert.equal(next.state, "READY");
});

test("late events cannot replace current run; cancellation suppresses subsequent deltas", () => {
  let state = runtimeReducer(initialRuntime, {
    type: "start",
    requestId: "new",
  });
  assert.equal(
    runtimeReducer(state, {
      type: "event",
      event: { requestId: "old", state: "READY", content: "Wrong source" },
    }),
    state,
  );
  state = runtimeReducer(state, { type: "stop" });
  assert.equal(
    runtimeReducer(state, {
      type: "event",
      event: { requestId: "new", state: "GENERATING", content: "late" },
    }),
    state,
  );
  state = runtimeReducer(state, { type: "error", message: "Stopped" });
  state = runtimeReducer(state, { type: "finish" });
  assert.equal(state.requestId, null);
  assert.equal(state.content, "");
});
