const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const stations = require("../station-service.cjs");
const { ChatService } = require("./chat-service.cjs");
const { ModelRegistry, DEFAULTS } = require("./model-registry.cjs");
const { readModelRun } = require("./run-store.cjs");
const { budgetHistory } = require("./history-budget.cjs");
const { answerPrefix, validateAnswer } = require("./response-validation.cjs");

const scopeInput = { activeStationIds: [], matchMode: "any" };
const repeatedSummary =
  "The document describes the company, its customer segments, trading products, custody services, wallet infrastructure, revenue sources, research observations, and operating risks. It provides an overview of the business and its financial metrics.";

test("copied summaries receive one correction for a new question without duplicating history", async (t) => {
  const f = await fixture(t);
  const calls = [];
  let answer = repeatedSummary;
  f.provider.complete = async (request) => {
    calls.push(request);
    request.onContent?.(JSON.stringify({ answer }));
    return {
      model: request.model,
      content: JSON.stringify({ answer }),
      finishReason: "stop",
      usage: null,
    };
  };
  await f.service.run(f.root, 1, f.input());
  const original = f.provider.complete;
  f.provider.complete = async (request) => {
    if (calls.length === 2)
      answer =
        "1. The source contains ALPHA. It does not support five distinct facts.";
    return original(request);
  };
  const events = [];
  const result = await f.service.run(
    f.root,
    1,
    f.input(undefined, { userMessage: "Tell me 5 facts from the file." }),
    (event) => events.push(event),
  );
  assert.equal(calls.length, 3);
  assert.equal(
    result.run.diagnostics.initialValidationFailure,
    "repeated_answer",
  );
  assert.equal(result.run.diagnostics.validationRepairCount, 1);
  assert.equal(result.conversation.messages.length, 4);
  assert.equal(result.conversation.attempts.length, 2);
  assert.equal(
    calls[2].answerRepair,
    true,
    "Repetition correction uses the existing bounded answer-repair path",
  );
  assert.equal(
    calls[2].messages.at(-1).content,
    "Tell me 5 facts from the file.",
  );
  assert.ok(
    events.some(
      (event) => event.state === "VALIDATING" && event.content === "",
    ),
  );
  answer = repeatedSummary;
  f.provider.complete = original;
  await assert.rejects(
    f.service.run(
      f.root,
      1,
      f.input(undefined, { userMessage: "Give the main risks instead." }),
    ),
    { code: "MODEL_INVALID_RESPONSE" },
  );
  assert.equal(calls.length, 5);
  assert.equal(
    (await f.service.list(f.root))[0].messages.filter(
      (message) => message.role === "assistant",
    ).length,
    2,
  );
});

test("repeat requests, repeated questions, and short factual answers remain valid", () => {
  const history = [
    { role: "user", content: "Summarize this." },
    { role: "assistant", content: repeatedSummary },
  ];
  const response = {
    content: JSON.stringify({ answer: repeatedSummary }),
    finishReason: "stop",
  };
  for (const question of [
    "Summarize this.",
    "Repeat the previous answer verbatim.",
  ])
    assert.equal(validateAnswer(response, question, history), repeatedSummary);
  assert.equal(
    validateAnswer(
      { content: '{"answer":"25%"}', finishReason: "stop" },
      "What percentage?",
      [
        { role: "user", content: "What allocation?" },
        { role: "assistant", content: "25%" },
      ],
    ),
    "25%",
  );
});
const { ModelRuntimeError } = require("./model-errors.cjs");

test("timeout recovery retains one turn, one audit, and resets provisional text", async (t) => {
  for (const phase of ["load", "generation"]) {
    const f = await fixture(t);
    const complete = f.provider.complete;
    let attempts = 0;
    const failOnce = async (request) => {
      if (++attempts === 1) {
        request?.onContent?.('{"answer":"Rejected partial');
        throw new ModelRuntimeError("MODEL_TIMEOUT", "Slow model");
      }
      return request ? complete(request) : undefined;
    };
    if (phase === "load") f.provider.prepare = () => failOnce();
    else f.provider.complete = failOnce;
    const events = [];
    const input = f.input();
    const result = await f.service.run(f.root, 1, input, (event) =>
      events.push(event),
    );
    assert.equal(attempts, 2);
    assert.equal(result.conversation.messages.length, 2);
    assert.equal(result.conversation.attempts.length, 1);
    assert.equal(result.run.diagnostics.timeoutRetryCount, 1);
    assert.equal(result.run.status, "succeeded");
    assert.ok(
      events.some(
        (event) =>
          event.content === "" && event.diagnostics?.timeoutRetryCount === 1,
      ),
    );
    assert.equal(new Set(events.map((event) => event.runId)).size, 1);
    await f.service.run(f.root, 1, input);
    assert.equal(attempts, 2);
  }
});

test("timeout retry is bounded across loading and generation; other failures are not retried", async (t) => {
  for (const code of [
    "MODEL_TIMEOUT",
    "MODEL_OFFLINE",
    "MODEL_INVALID_RESPONSE",
  ]) {
    const f = await fixture(t);
    let attempts = 0;
    f.provider.complete = async () => {
      attempts++;
      throw new ModelRuntimeError(code, "Failed");
    };
    await assert.rejects(f.service.run(f.root, 1, f.input()), { code });
    assert.equal(attempts, code === "MODEL_TIMEOUT" ? 2 : 1);
    assert.equal(f.service.active, null);
  }
  const f = await fixture(t);
  let loads = 0;
  let generations = 0;
  f.provider.prepare = async () => {
    if (++loads === 1)
      throw new ModelRuntimeError("MODEL_TIMEOUT", "Load timeout");
  };
  f.provider.complete = async () => {
    generations++;
    throw new ModelRuntimeError("MODEL_TIMEOUT", "Generation timeout");
  };
  await assert.rejects(f.service.run(f.root, 1, f.input()), {
    code: "MODEL_TIMEOUT",
  });
  assert.equal(loads, 2);
  assert.equal(generations, 1);
});

test("Stop and the original absolute deadline prevent further timeout recovery", async (t) => {
  for (const stop of [true, false]) {
    const f = await fixture(t);
    if (!stop) await f.registry.save({ absoluteTimeoutMs: 1000 });
    let attempts = 0;
    f.provider.complete = async (request) => {
      attempts++;
      if (stop || attempts === 2) {
        await new Promise((resolve) =>
          request.signal.addEventListener("abort", resolve, { once: true }),
        );
      }
      throw new ModelRuntimeError("MODEL_TIMEOUT", "Timeout");
    };
    const input = f.input();
    const pending = f.service.run(f.root, 1, input, (event) => {
      if (stop && event.state === "GENERATING")
        setTimeout(() => f.service.cancel(1, input.requestId), 10);
    });
    await assert.rejects(pending, {
      code: stop ? "MODEL_CANCELLED" : "MODEL_TIMEOUT",
    });
    assert.equal(attempts, stop ? 1 : 2);
    assert.equal(f.service.active, null);
  }
});
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wonnyy-chat-test-"));
  t.after(async () => {
    assert.ok(
      path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    await fs.rm(root, { recursive: true, force: true });
  });
  const calls = [];
  const provider = {
    listModels: async () => [
      { name: "qwen3:4b", size: 2000, capabilities: ["completion"] },
      { name: "qwen3:1.7b", size: 1000, capabilities: ["completion"] },
    ],
    getStatus: async () => ({
      online: true,
      error: null,
      models: await provider.listModels(),
    }),
    complete: async (request) => {
      calls.push(request);
      request.onContent?.('{"answer":"Source answer."}');
      return {
        model: request.model,
        provider: "ollama",
        content: '{"answer":"Source answer."}',
        finishReason: "stop",
        createdAt: new Date().toISOString(),
        usage: null,
      };
    },
  };
  const registry = new ModelRegistry(provider, path.join(root, "settings"));
  await registry.save({ modelId: "qwen3:4b" });
  const service = new ChatService({ provider, registry });
  await fs.writeFile(
    path.join(root, "a.md"),
    "The A source only contains ALPHA.",
  );
  await fs.writeFile(
    path.join(root, "b.md"),
    "The B source only contains BETA.",
  );
  await stations.addContext(root, ["a.md"]);
  const conversation = await service.create(root, scopeInput);
  const input = (chat = conversation, extra = {}) => ({
    ...scopeInput,
    conversationId: chat.id,
    requestId: randomUUID(),
    userMessage: "Summarize this.",
    expectedContextId: chat.contextIdentity.id,
    ...extra,
  });
  return { root, calls, provider, registry, service, conversation, input };
}

test("backend owns ten-turn history, model switching, duplicate delivery, and source isolation", async (t) => {
  const f = await fixture(t);
  let result;
  for (let i = 0; i < 10; i++)
    result = await f.service.run(f.root, 1, f.input());
  assert.equal(result.conversation.messages.length, 20);
  assert.equal(f.calls.at(-1).messages.length, 21);
  await f.registry.save({ modelId: "qwen3:1.7b" });
  const request = f.input();
  result = await f.service.run(f.root, 1, request);
  assert.equal(result.run.model, "qwen3:1.7b");
  assert.equal(result.run.schemaVersion, 2);
  await f.service.run(f.root, 1, request);
  assert.equal(f.calls.length, 11);
  await assert.rejects(
    f.service.run(f.root, 1, { ...f.input(), history: [] }),
    { code: "MODEL_INVALID_REQUEST" },
  );
  await stations.clearContext(f.root);
  await stations.addContext(f.root, ["b.md"]);
  await assert.rejects(f.service.run(f.root, 1, f.input()), {
    code: "MODEL_CONTEXT_INVALID",
  });
  const second = await f.service.create(f.root, scopeInput);
  await f.service.run(f.root, 1, f.input(second));
  assert.equal(f.calls.at(-1).messages.length, 3);
  assert.ok(!JSON.stringify(f.calls.at(-1).messages).includes("ALPHA"));
  await f.service.resume(f.root, f.conversation.id);
  assert.equal(
    (await f.service.context(f.root, scopeInput)).id,
    f.conversation.contextIdentity.id,
  );
  const other = path.join(f.root, "another-vault");
  await fs.mkdir(other);
  await assert.rejects(f.service.run(other, 1, f.input()));
});

test("source changes require explicit approval and old hashes cannot resume", async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, "a.md"), "A revised version.");
  await assert.rejects(f.service.run(f.root, 1, f.input()), {
    code: "MODEL_CONTEXT_INVALID",
  });
  await assert.rejects(f.service.resume(f.root, f.conversation.id), {
    code: "BRAIN_SOURCE_CHANGED",
  });
  await f.service.refreshSource(f.root);
  const revised = await f.service.create(f.root, scopeInput);
  assert.notEqual(
    revised.contextIdentity.id,
    f.conversation.contextIdentity.id,
  );
  assert.equal(f.calls.length, 0);
});

test("cancellation is owner-bound, prevents duplicates, and permits an immediate retry", async (t) => {
  const f = await fixture(t);
  const normal = f.provider.complete;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  f.provider.complete = (request) =>
    new Promise((_, reject) => {
      entered();
      request.signal.addEventListener(
        "abort",
        () => reject(request.signal.reason),
        { once: true },
      );
    });
  const input = f.input();
  const running = f.service.run(f.root, 1, input);
  const rejected = assert.rejects(running, { code: "MODEL_CANCELLED" });
  await started;
  assert.equal(await f.service.cancel(2, input.requestId), false);
  await assert.rejects(f.service.run(f.root, 1, input), { code: "MODEL_BUSY" });
  await f.service.cancel(1, input.requestId);
  await rejected;
  const chat = (await f.service.list(f.root))[0];
  assert.equal(chat.attempts[0].status, "cancelled");
  assert.equal(chat.messages.length, 1);
  f.provider.complete = normal;
  const result = await f.service.run(
    f.root,
    1,
    f.input(chat, { retryOf: input.requestId }),
  );
  assert.equal(result.conversation.messages.length, 2);
});

test("restart recovers only pending references and deletion retains audits without resurrection", async (t) => {
  const f = await fixture(t);
  const result = await f.service.run(f.root, 1, f.input());
  const { store } = await f.service.store(f.root);
  await store.update(f.conversation.id, (value) => {
    value.messages = value.messages.filter(
      (message) => message.role === "user",
    );
    value.attempts[0].status = "pending";
  });
  const restarted = new ChatService({
    provider: f.provider,
    registry: f.registry,
  });
  assert.equal((await restarted.list(f.root))[0].messages.length, 2);
  await restarted.remove(f.root, f.conversation.id);
  assert.equal(
    (await readModelRun(f.root, result.run.runId)).response,
    "Source answer.",
  );
  assert.deepEqual(
    await new ChatService({ provider: f.provider, registry: f.registry }).list(
      f.root,
    ),
    [],
  );
});

test("unrecorded pending turns become interrupted and corrupt snapshots remain intact", async (t) => {
  const f = await fixture(t);
  const { store } = await f.service.store(f.root);
  await store.update(f.conversation.id, (value) => {
    const userMessageId = randomUUID();
    value.messages.push({
      id: userMessageId,
      conversationId: value.id,
      role: "user",
      content: "Question",
      createdAt: new Date().toISOString(),
    });
    value.attempts.push({
      requestId: randomUUID(),
      runId: randomUUID(),
      userMessageId,
      status: "pending",
    });
  });
  const restarted = new ChatService({
    provider: f.provider,
    registry: f.registry,
  });
  assert.equal(
    (await restarted.list(f.root))[0].attempts[0].status,
    "interrupted",
  );
  await fs.writeFile(store.file(f.conversation.id), "broken");
  await assert.rejects(restarted.list(f.root), {
    code: "MODEL_STORAGE_INVALID",
  });
  assert.equal(
    await fs.readFile(store.file(f.conversation.id), "utf8"),
    "broken",
  );
});

test("budgeting drops whole exchanges and never truncates source", () => {
  const base = [{ role: "user", content: "a".repeat(1000) }];
  const history = Array.from({ length: 24 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: "h".repeat(600),
  }));
  const result = budgetHistory(base, history, {
    contextWindow: 2048,
    outputLimit: 512,
  });
  assert.equal(result.history.length % 2, 0);
  assert.ok(result.diagnostics.droppedExchanges > 0);
  assert.throws(
    () => budgetHistory([{ content: "a".repeat(20_000) }], [], DEFAULTS),
    { code: "MODEL_CONTEXT_TOO_LARGE" },
  );
});

test("answer decoding hides framing and thinking; final validation rejects incomplete results", () => {
  assert.equal(answerPrefix('{"answer":"Hello \\uD83D'), "");
  assert.equal(answerPrefix('{"answer":"Hello \\uD83D\\uDE00!"}'), "Hello 😀!");
  assert.equal(
    answerPrefix('{"answer":"I need to inspect the document first."}'),
    "",
  );
  for (const content of [
    '{"answer":""}',
    '{"answer":"I need to inspect the file."}',
    '{"answer":"ok","extra":true}',
    "invalid",
  ])
    assert.throws(() => validateAnswer({ content, finishReason: "stop" }));
  assert.throws(() =>
    validateAnswer({ content: '{"answer":"ok"}', finishReason: "length" }),
  );
});

test("snapshot failure after audit publication recovers exactly once without another model call", async (t) => {
  const f = await fixture(t);
  const { store } = await f.service.store(f.root);
  const write = store.write.bind(store);
  store.write = async (value) => {
    if (value.attempts.some((attempt) => attempt.status === "succeeded"))
      throw Object.assign(new Error("Simulated disk failure"), {
        code: "MODEL_STORAGE_FAILED",
      });
    return write(value);
  };
  await assert.rejects(f.service.run(f.root, 1, f.input()), {
    code: "MODEL_STORAGE_FAILED",
  });
  const restarted = new ChatService({
    provider: f.provider,
    registry: f.registry,
  });
  assert.equal((await restarted.list(f.root))[0].messages.length, 2);
  assert.equal(f.calls.length, 1);
  assert.equal((await restarted.list(f.root))[0].messages.length, 2);
});

test("knowledge changes reserve admission before awaiting cancellation", async (t) => {
  const f = await fixture(t);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const changing = f.service.changeKnowledge(async () => {
    await gate;
  });
  await assert.rejects(f.service.run(f.root, 1, f.input()), {
    code: "MODEL_BUSY",
  });
  await assert.rejects(f.service.create(f.root, scopeInput), {
    code: "MODEL_BUSY",
  });
  release();
  await changing;
  await f.service.run(f.root, 1, f.input());
});

test("vault changes wait for in-flight mutations and keep admission reserved through the queue", async (t) => {
  const f = await fixture(t);
  const order = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const scanning = f.service.exclusive(async () => {
    order.push("scan");
    await gate;
  });
  const switching = f.service.changeKnowledge(async () => {
    order.push("switch");
    await assert.rejects(f.service.run(f.root, 1, f.input()), {
      code: "MODEL_BUSY",
    });
    return "new vault";
  });
  const refreshing = f.service.changeKnowledge(async () => {
    order.push("refresh");
  });
  // Attach handlers before releasing the blocked scan, including on regressions.
  const results = Promise.allSettled([scanning, switching, refreshing]);
  await assert.rejects(f.service.create(f.root, scopeInput), {
    code: "MODEL_BUSY",
  });
  release();
  const settled = await results;
  assert.deepEqual(
    settled.map((result) => result.status),
    ["fulfilled", "fulfilled", "fulfilled"],
  );
  assert.equal(settled[1].value, "new vault");
  assert.deepEqual(order, ["scan", "switch", "refresh"]);
  await f.service.run(f.root, 1, f.input());
});

test("a failed queued operation does not block the next vault change", async (t) => {
  const f = await fixture(t);
  const failing = f.service.changeKnowledge(async () => {
    throw new Error("Unreadable folder");
  });
  const switching = f.service.changeKnowledge(async () => "recovered");
  const results = await Promise.allSettled([failing, switching]);
  assert.equal(results[0].status, "rejected");
  assert.deepEqual(results[1], { status: "fulfilled", value: "recovered" });
  await f.service.run(f.root, 1, f.input());
});

test("queued vault changes wait for generation cancellation cleanup", async (t) => {
  const f = await fixture(t);
  let started;
  let aborted;
  let release;
  const generating = new Promise((resolve) => {
    started = resolve;
  });
  const cancelling = new Promise((resolve) => {
    aborted = resolve;
  });
  const cleanup = new Promise((resolve) => {
    release = resolve;
  });
  f.provider.complete = (request) =>
    new Promise((_, reject) => {
      started();
      request.signal.addEventListener(
        "abort",
        () => {
          aborted();
          void cleanup.then(() => reject(request.signal.reason));
        },
        { once: true },
      );
    });
  const stopped = assert.rejects(f.service.run(f.root, 1, f.input()), {
    code: "MODEL_CANCELLED",
  });
  await generating;
  let switched = false;
  const changing = f.service.changeKnowledge(async () => {
    switched = true;
    assert.equal(f.service.active, null);
    assert.equal(
      (await f.service.list(f.root))[0].attempts[0].status,
      "cancelled",
    );
  });
  await cancelling;
  assert.equal(switched, false);
  await assert.rejects(f.service.run(f.root, 1, f.input()), {
    code: "MODEL_BUSY",
  });
  release();
  await Promise.all([stopped, changing]);
  assert.equal(switched, true);
});

test("model registry preserves missing selections and validates unknown model capabilities", async (t) => {
  const f = await fixture(t);
  f.provider.listModels = async () => [
    { name: "other:small", capabilities: ["embedding"], size: 100 },
  ];
  const state = await f.registry.state();
  assert.equal(state.settings.modelId, "qwen3:4b");
  assert.equal(state.models[0].profile, "unprofiled");
  await assert.rejects(f.registry.save({ modelId: "other:small" }), {
    code: "MODEL_INVALID_REQUEST",
  });
  await assert.rejects(f.registry.validateSelection(await f.registry.read()), {
    code: "MODEL_NOT_FOUND",
  });
});

test("task echoes receive one bounded repair and rejected output never enters history", async (t) => {
  const f = await fixture(t);
  const normal = f.provider.complete;
  let attempts = 0;
  f.provider.complete = async (request) => {
    attempts++;
    if (attempts === 1)
      return {
        model: request.model,
        content: JSON.stringify({ answer: request.messages.at(-1).content }),
        finishReason: "stop",
        usage: null,
      };
    return normal(request);
  };
  const result = await f.service.run(f.root, 1, f.input());
  assert.equal(attempts, 2);
  assert.equal(result.run.diagnostics.validationRepairCount, 1);
  assert.equal(result.conversation.messages.length, 2);
  assert.equal(result.conversation.attempts.length, 1);
  f.provider.complete = async (request) => {
    attempts++;
    return {
      model: request.model,
      content: JSON.stringify({ answer: request.messages.at(-1).content }),
      finishReason: "stop",
      usage: null,
    };
  };
  await assert.rejects(f.service.run(f.root, 1, f.input()), {
    code: "MODEL_INVALID_RESPONSE",
  });
  assert.equal(attempts, 4);
  assert.equal(
    (await f.service.list(f.root))[0].messages.filter(
      (message) => message.role === "assistant",
    ).length,
    1,
  );
});
