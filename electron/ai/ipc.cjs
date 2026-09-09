const {
  ModelRuntimeError,
  serializeModelError,
} = require("./model-errors.cjs");
const {
  z,
  parse,
  parseCredential,
  credentialProvider,
} = require("./schemas.cjs");
const { checkRemoteModel } = require("./model-check.cjs");
const API_VERSION = 11;

function registerAiIpc({
  ipcMain,
  getVault,
  service,
  registry,
  provider,
  credentials,
}) {
  const compatible = new Set();
  const checks = new Map();
  ipcMain.handle("ai:handshake", (event, version) => {
    if (version === API_VERSION) compatible.add(event.sender.id);
    else compatible.delete(event.sender.id);
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
  handle("checkRemoteModel", (event, input) => {
    const { providerId, model } = parse(
      z
        .object({
          providerId: z.enum(["gemini", "nvidia"]),
          model: z
            .string()
            .min(1)
            .max(200)
            .regex(/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?$/),
        })
        .strict(),
      input,
    );
    return service.exclusive(async () => {
      const controller = new AbortController();
      const abort = () =>
        controller.abort(
          new ModelRuntimeError("MODEL_CANCELLED", "Model check stopped."),
        );
      checks.set(event.sender.id, abort);
      event.sender.once?.("destroyed", abort);
      try {
        return await checkRemoteModel(
          registry.providerFor(providerId),
          providerId,
          model,
          controller.signal,
        );
      } finally {
        checks.delete(event.sender.id);
        event.sender.removeListener?.("destroyed", abort);
      }
    });
  });
  handle("stopModelChecks", (event) => {
    checks.get(event.sender.id)?.();
  });
  handle("checkNvidiaModel", (_, model) =>
    service.exclusive(() => registry.providerFor("nvidia").probe(model)),
  );
  handle("saveCredential", (_, input) =>
    service.exclusive(() => credentials.save(parseCredential(input))),
  );
  handle("removeCredential", (_, input) =>
    service.exclusive(() =>
      credentials.remove(parse(credentialProvider, input)),
    ),
  );
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
