import type {
  ConstructionSourceBinding,
  ContextBox,
  Conversation,
} from "../../types/ai";
export const constructionSourceLabel = (source: ConstructionSourceBinding) =>
  "relativePath" in source ? source.relativePath : source.boxName;
export const conversationSourceLabel = (
  conversation: Conversation,
  boxes: ContextBox[],
) =>
  conversation.contextFile?.relativePath ??
  boxes.find((box) => box.id === conversation.contextBoxId)?.name ??
  (conversation.contextBoxId ? "Unavailable Context Box" : "Legacy context");
