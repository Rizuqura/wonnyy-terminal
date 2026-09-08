const {
  ModelRuntimeError,
  serializeModelError,
} = require("./model-errors.cjs");
const API_VERSION = 8;

function registerAiIpc({ ipcMain, getVault, service, registry, provider }) {
  const compatible = new Set();
  ipcMain.handle("ai:handshake", (event, version) => {
    if (version === API_VERSION) compatible.add(event.sender.id);
    return { apiVersion: API_VERSION };
  });
  const handle = (name, operation) =>
    ipcMain.handle(`ai:${name}`, async (event, input) => {
      try {
        if (!compatible.has(event.sender.id))
          throw new ModelRuntimeError(
            "MODEL_RESTART_REQUIRED",
            "Restart Wonnyy to load the matching desktop backend.",
          );
        return { ok: true, value: await operation(event, input) };
      } catch (error) {
        return { ok: false, error: serializeModelError(error) };
      }
    });
  handle("getStatus", () => provider.getStatus());
  handle("listModels", () => provider.listModels());
  handle("testModel", (_, model) =>
    service.exclusive(() => provider.testModel(model)),
  );
  handle("models", () => registry.state());
  handle("settings", (_, input) =>
    service.exclusive(() => registry.save(input)),
  );
  handle("context", (_, input) => service.context(getVault(), input));
  handle("listConversations", () => service.list(getVault()));
  handle("createConversation", (_, input) => service.create(getVault(), input));
  handle("renameConversation", (_, input) => service.rename(getVault(), input));
  handle("deleteConversation", (_, id) => service.remove(getVault(), id));
  handle("clearConversations", () => service.clear(getVault()));
  handle("resumeConversation", (_, id) => service.resume(getVault(), id));
  handle("refreshSource", () => service.refreshSource(getVault()));
  handle("cancel", (event, id) => service.cancel(event.sender.id, id));
  handle("chat", (event, input) =>
    service.run(getVault(), event.sender.id, input, (value) => {
      if (!event.sender.isDestroyed()) event.sender.send("ai:event", value);
    }),
  );
}

module.exports = { API_VERSION, registerAiIpc };
