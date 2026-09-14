const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { ModelRuntimeError } = require("./model-errors.cjs");

function createDatasetSession(signal) {
  signal?.throwIfAborted();
  const worker = new Worker(path.join(__dirname, "dataset-worker.cjs"), {
    resourceLimits: { maxOldGenerationSizeMb: 512 },
  });
  const pending = new Map();
  let sequence = 0,
    closed = false;
  const rejectAll = (error) => {
    for (const item of pending.values()) item.reject(error);
    pending.clear();
  };
  let closing;
  const close = () => {
    if (closing) return closing;
    if (closed) return Promise.resolve();
    closed = true;
    signal?.removeEventListener("abort", abort);
    rejectAll(
      signal?.reason ??
        new ModelRuntimeError(
          "MODEL_CANCELLED",
          "Dataset analysis was stopped.",
        ),
    );
    closing = worker.terminate();
    return closing;
  };
  const abort = () => {
    void close();
  };
  worker.on("message", ({ id, value, error }) => {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    if (error)
      item.reject(new ModelRuntimeError("MODEL_INVALID_REQUEST", error));
    else item.resolve(value);
  });
  worker.on("error", (error) =>
    rejectAll(
      new ModelRuntimeError(
        "MODEL_INTERNAL_ERROR",
        `Dataset worker failed: ${error.message}`,
      ),
    ),
  );
  worker.on("exit", () => {
    closed = true;
    signal?.removeEventListener("abort", abort);
    rejectAll(
      new ModelRuntimeError("MODEL_INTERNAL_ERROR", "Dataset worker exited."),
    );
  });
  signal?.addEventListener("abort", abort, { once: true });
  return {
    call(method, data) {
      signal?.throwIfAborted();
      if (closed)
        throw new ModelRuntimeError(
          "MODEL_INTERNAL_ERROR",
          "Dataset worker is unavailable.",
        );
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, method, ...data });
      });
    },
    close,
  };
}
module.exports = { createDatasetSession };
