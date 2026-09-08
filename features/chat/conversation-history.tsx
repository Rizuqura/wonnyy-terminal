"use client";

import { useState } from "react";
import type { ChatController } from "./use-chat-runtime";
import { useConfirmation } from "../dialogs/use-confirmation";

export function ConversationHistory({
  chat,
  onCompose,
}: {
  chat: ChatController;
  onCompose: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const { confirm, confirmation } = useConfirmation();
  const [title, setTitle] = useState("");
  return (
    <div className="chat-history">
      <div className="chat-history-actions">
        <select
          aria-label="Conversation history"
          value={chat.conversation?.id ?? ""}
          disabled={chat.busy}
          onChange={(event) => {
            setRenaming(false);
            chat.selectChat(event.target.value);
            onCompose();
          }}
        >
          <option value="">Choose a conversation</option>
          {chat.conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title} · {conversation.messages.length} messages
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            chat.newChat();
            onCompose();
          }}
          disabled={chat.busy}
        >
          New Chat
        </button>
      </div>
      {chat.conversation && (
        <details>
          <summary>Manage history</summary>
          <div className="chat-history-actions">
            <button
              disabled={chat.busy}
              onClick={() => {
                setTitle(chat.conversation!.title);
                setRenaming(true);
              }}
            >
              Rename
            </button>
            <button
              disabled={chat.busy}
              onClick={async () => {
                if (
                  await confirm(
                    "Delete this conversation? Source files remain. Separate model-run audit records retain questions and answers.",
                    "Delete chat",
                  )
                )
                  chat.remove(false);
              }}
            >
              Delete chat
            </button>
            <button
              disabled={chat.busy}
              onClick={async () => {
                if (
                  await confirm(
                    "Clear all chat history in this vault? Source files remain. Separate model-run audit records retain questions and answers.",
                    "Clear history",
                  )
                )
                  chat.remove(true);
              }}
            >
              Clear history
            </button>
          </div>
          {renaming && (
            <form
              className="chat-history-actions"
              onSubmit={(event) => {
                event.preventDefault();
                chat.rename(title);
                setRenaming(false);
              }}
            >
              <input
                aria-label="Chat title"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
              />
              <button disabled={chat.busy || !title.trim()}>Save title</button>
            </form>
          )}
        </details>
      )}
      {confirmation}
    </div>
  );
}
