const { contextBridge, ipcRenderer } = require("electron");

async function invokeBrain(channel, input) {
  const result = await ipcRenderer.invoke(channel, input);
  if (result?.ok) return result.value;
  const error = new Error(result?.error?.message || "Brain operation failed.");
  error.name = "BrainScopeError";
  error.code = result?.error?.code || "BRAIN_INTERNAL_ERROR";
  error.details = result?.error?.details || {};
  throw error;
}

async function invokeModel(channel, input) {
  const result = await ipcRenderer.invoke(channel, input);
  if (result?.ok) return result.value;
  const error = new Error(result?.error?.message || "Model operation failed.");
  error.name = "ModelRuntimeError";
  error.code = result?.error?.code || "MODEL_INTERNAL_ERROR";
  error.details = result?.error?.details || {};
  throw error;
}

// Future desktop capabilities must be exposed here deliberately, not by giving
// renderer components unrestricted Node.js or filesystem access.
contextBridge.exposeInMainWorld("wonnyyDesktop", {
  apiVersion: 5,
  platform: process.platform,
  vault: {
    getSnapshot: () => ipcRenderer.invoke("vault:getSnapshot"),
    rescan: () => ipcRenderer.invoke("vault:rescan"),
    selectFolder: () => ipcRenderer.invoke("vault:selectFolder"),
    read: (relativePath) => ipcRenderer.invoke("vault:read", relativePath),
    readPdf: (relativePath) => ipcRenderer.invoke("vault:readPdf", relativePath),
    search: (query) => ipcRenderer.invoke("vault:search", query),
  },
  stations: {
    getState: () => ipcRenderer.invoke("stations:getState"),
    create: (name) => ipcRenderer.invoke("stations:create", name),
    rename: (id, name) => ipcRenderer.invoke("stations:rename", id, name),
    delete: (id) => ipcRenderer.invoke("stations:delete", id),
    setAssignments: (paths, stationId, assigned) => ipcRenderer.invoke("stations:setAssignments", paths, stationId, assigned),
    suggestions: () => ipcRenderer.invoke("stations:suggestions"),
    reattach: (fromPath, toPath) => ipcRenderer.invoke("stations:reattach", fromPath, toPath),
  },
  context: {
    preview: (paths) => ipcRenderer.invoke("context:preview", paths),
    add: (paths) => ipcRenderer.invoke("context:add", paths),
    remove: (paths) => ipcRenderer.invoke("context:remove", paths),
    clear: () => ipcRenderer.invoke("context:clear"),
    buildPackage: () => ipcRenderer.invoke("context:buildPackage"),
    prepareBrainScope: (input) => invokeBrain("brain:prepareScope", input),
    readBrainSource: (input) => invokeBrain("brain:readSource", input),
  },
  ai: {
    getStatus: () => invokeModel("ai:getStatus"),
    listModels: () => invokeModel("ai:listModels"),
    testModel: (model) => invokeModel("ai:testModel", model),
  },
});
