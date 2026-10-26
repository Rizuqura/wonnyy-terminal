const { ModelRuntimeError } = require("./model-errors.cjs");

class ModelPullService {
  constructor(provider, publish = () => {}) {
    this.provider = provider;
    this.publish = publish;
    this.operations = new Map();
  }
  list() {
    return [...this.operations.values()].map((op) => op.status);
  }
  start(rawModel, ownerId) {
    if (
      typeof rawModel !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(rawModel) ||
      rawModel.includes("..")
    )
      throw new ModelRuntimeError(
        "MODEL_INVALID_REQUEST",
        "Enter an Ollama model name, such as qwen3:4b.",
      );
    const model = rawModel.includes(":") ? rawModel : rawModel + ":latest";
    const existing = this.operations.get(model);
    if (existing?.status.phase === "model-pulling") return existing.promise;
    if (existing?.status.phase === "model-installed")
      return Promise.resolve(existing.status);
    if (this.list().some((item) => item.phase === "model-pulling"))
      throw new ModelRuntimeError(
        "MODEL_BUSY",
        "Finish or cancel the current download first.",
      );
    const controller = new AbortController();
    const op = {
      ownerId,
      controller,
      status: {
        model,
        phase: "model-pulling",
        startedAt: Date.now(),
        message: "Requesting model layers.",
      },
    };
    this.operations.set(model, op);
    const update = (value) => {
      op.status = { ...op.status, ...value };
      this.publish(op.status);
    };
    update({});
    op.promise = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return this.provider.pull(model, controller.signal, update);
      })
      .then(() => {
        controller.signal.throwIfAborted();
        update({
          phase: "model-installed",
          message: "Model installed. Select it to use in chat.",
          progress: undefined,
        });
        return op.status;
      })
      .catch(() => {
        update({
          phase: controller.signal.aborted ? "cancelled" : "error",
          message: controller.signal.aborted
            ? "Download cancelled."
            : "Model download failed. Check Ollama and try again.",
          error: controller.signal.aborted ? undefined : "MODEL_PULL_FAILED",
          progress: undefined,
        });
        return op.status;
      });
    return op.promise;
  }
  async cancel(model, ownerId) {
    const op = this.operations.get(
      model.includes(":") ? model : model + ":latest",
    );
    if (op?.ownerId === ownerId && op.status.phase === "model-pulling") {
      op.controller.abort();
      await op.promise;
    }
  }
  cancelOwner(ownerId) {
    for (const op of this.operations.values())
      if (op.ownerId === ownerId && op.status.phase === "model-pulling")
        op.controller.abort();
  }
}
module.exports = { ModelPullService };
