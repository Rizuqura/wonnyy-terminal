const { contextBridge, ipcRenderer } = require("electron");

// Future desktop capabilities must be exposed here deliberately, not by giving
// renderer components unrestricted Node.js or filesystem access.
contextBridge.exposeInMainWorld("wonnyyDesktop", {
  apiVersion: 3,
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
    prepareBrainScope: (input) => ipcRenderer.invoke("brain:prepareScope", input),
    readBrainSource: (scopeId, sourceId) => ipcRenderer.invoke("brain:readSource", scopeId, sourceId),
  },
});
