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

test("cancelled and insufficient results remain neutral terminal states after finish", () => {
  for (const phase of ["CANCELLED", "CONTEXT_INSUFFICIENT"]) {
    let state = runtimeReducer(initialRuntime, {
      type: "start",
      requestId: "run",
    });
    state = runtimeReducer(state, {
      type: "event",
      event: { requestId: "run", state: phase },
    });
    state = runtimeReducer(state, { type: "finish" });
    assert.equal(state.state, phase);
    assert.equal(state.requestId, null);
    assert.equal(state.error, null);
  }
});

test("duplicate starts and late tokens cannot replace an active or cancelled request", () => {
  let state = runtimeReducer(initialRuntime, {
    type: "start",
    requestId: "one",
  });
  assert.equal(
    runtimeReducer(state, { type: "start", requestId: "two" }),
    state,
  );
  state = runtimeReducer(state, {
    type: "event",
    event: { requestId: "one", state: "CANCELLED" },
  });
  assert.equal(
    runtimeReducer(state, {
      type: "event",
      event: { requestId: "one", state: "GENERATING", content: "late" },
    }),
    state,
  );
});
