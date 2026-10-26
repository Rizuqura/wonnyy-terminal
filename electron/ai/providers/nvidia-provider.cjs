const {
  OpenAIChatProvider,
  remoteError,
} = require("./openai-chat-provider.cjs");
class NvidiaProvider extends OpenAIChatProvider {}
module.exports = { NvidiaProvider, remoteError };
