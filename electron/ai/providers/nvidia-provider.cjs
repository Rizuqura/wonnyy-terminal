const {
  OpenAIChatProvider,
  remoteError,
} = require("./openai-chat-provider.cjs");
class NvidiaProvider extends OpenAIChatProvider {
  /** Ordinary QTerminal chat requests ask for final answers, not hidden thinking.
   * This exact NIM deployment enables thinking by default with a 16K reasoning
   * budget, which can exhaust a smaller max_tokens before emitting any content.
   * Use its documented switch; do not increase user caps or guess other models.
   * https://build.nvidia.com/playbooks/nim-llm/instructions */
  generationParameters(model) {
    return model === "nvidia/nemotron-3.5-lightning-30b-a3b"
      ? { chat_template_kwargs: { enable_thinking: false } }
      : {};
  }
}
module.exports = { NvidiaProvider, remoteError };
