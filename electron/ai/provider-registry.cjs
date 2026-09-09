const { ModelRuntimeError } = require("./model-errors.cjs");

class ProviderRegistry {
  constructor(providers) {
    this.providers = new Map(Object.entries(providers));
  }
  get(id) {
    const provider = this.providers.get(id);
    if (!provider)
      throw new ModelRuntimeError(
        "MODEL_INVALID_REQUEST",
        "This provider is not supported.",
      );
    return provider;
  }
  entries() {
    return [...this.providers.entries()];
  }
}
module.exports = { ProviderRegistry };
