const { app } = require("electron");
if (!process.env.WONNYY_RELEASE_DOCUMENTS)
  throw Error("Isolated documents required");
app.setPath("documents", process.env.WONNYY_RELEASE_DOCUMENTS);
require("./electron-online-smoke-main.cjs");
