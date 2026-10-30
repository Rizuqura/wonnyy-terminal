import type {
  NormalizedChatRequest,
  ExperimentConversation,
  ExperimentConfig,
  TaskRequirements,
  LLMRequest,
} from "../../../types/front-office";
export function normalizeRequest(value: unknown): NormalizedChatRequest;
export function conversationMessages(
  conversation: ExperimentConversation,
  question: string,
): LLMRequest["messages"];
export function buildRequirements(
  request: NormalizedChatRequest,
  messages: LLMRequest["messages"],
  config: ExperimentConfig,
  selectedDeploymentId: string | null,
): TaskRequirements;
