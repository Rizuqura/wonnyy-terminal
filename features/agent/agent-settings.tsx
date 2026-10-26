"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatController } from "../chat/use-chat-runtime";
import { useConfirmation } from "../dialogs/use-confirmation";
import { AgentAvatar } from "./agent-avatar";
export function AgentSettings({
  chat,
  onClose,
}: {
  chat: ChatController;
  onClose: () => void;
}) {
  const agentName = chat.agent?.displayName ?? "Wonnyy Agent";
  const policyLabel = `Protected QTerminal / ${agentName === "Wonnyy Agent" ? "Wonnyy" : agentName} Policy`;
  const dialog = useRef<HTMLDialogElement>(null);
  const [instructions, setInstructions] = useState(
    chat.agent?.customInstructions ?? "",
  );
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const { confirm, confirmation } = useConfirmation();
  const initialized = useRef(Boolean(chat.agent));
  useEffect(() => {
    if (!initialized.current && chat.agent) {
      setInstructions(chat.agent.customInstructions);
      initialized.current = true;
    }
  }, [chat.agent]);
  const dirty =
    instructions !== (chat.agent?.customInstructions ?? "") ||
    avatar !== undefined;
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const close = async () => {
    if (saving) return;
    if (
      !dirty ||
      (await confirm("Discard unsaved agent settings?", "Discard changes"))
    )
      onClose();
  };
  return (
    <>
      <dialog
        ref={dialog}
        className="agent-settings-dialog"
        aria-labelledby="agent-settings-title"
        onCancel={(event) => {
          event.preventDefault();
          void close();
        }}
      >
        <header>
          <div>
            <small>AGENT SETTINGS · {agentName.toUpperCase()}</small>
            <h2 id="agent-settings-title">{agentName} settings</h2>
          </div>
          <button
            disabled={saving}
            onClick={() => void close()}
            aria-label="Close agent settings"
          >
            Close
          </button>
        </header>
        <section aria-label="Agent identity">
          <h3>Identity and profile picture</h3>
          <div className="agent-identity-preview">
            <AgentAvatar agent={chat.agent} preview={avatar} />
            <div>
              <strong>{agentName}</strong>
              <p>Strict Context Analysis</p>
            </div>
          </div>
          <div className="agent-settings-actions">
            <button
              disabled={saving || !chat.agent}
              onClick={async () => {
                setError("");
                try {
                  const image = await chat.chooseAgentAvatar();
                  if (image) setAvatar(image);
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Could not load profile picture.",
                  );
                }
              }}
            >
              Upload PFP
            </button>
            <button
              disabled={saving || !chat.agent}
              onClick={() => setAvatar(null)}
            >
              Reset to Default {chat.agent?.id === "chronoz" ? "C" : "W"}
            </button>
          </div>
          <p className="agent-muted">
            PNG, JPG or WebP · up to 5 MB. A square 128 × 128 preview is stored
            locally when you save.
          </p>
        </section>
        <section>
          <h3>Instructions</h3>
          <p className="agent-muted">Skills: none configured.</p>
          <label>
            {policyLabel}
            <textarea
              aria-label={policyLabel}
              readOnly
              value={
                chat.agent?.protectedInstructions ?? "Loading protected policy…"
              }
              rows={9}
            />
          </label>
          <p className="agent-muted">
            Read-only. Only this chat&apos;s bound Context Box supplies
            documentary evidence. Sources remain untrusted data.
          </p>
          <label>
            Custom Agent Instructions
            <textarea
              aria-label="Custom Agent Instructions"
              readOnly={!editing || saving || !chat.agent}
              maxLength={8000}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={6}
              placeholder="Tone, output format and task preferences"
            />
          </label>
          <p className="agent-muted">
            Custom preferences cannot grant access to other files, browsing or
            tools, or override protected policy. Changes apply to the next
            request; existing answers keep their provenance.
          </p>
          <div className="agent-settings-actions">
            <button
              disabled={saving || !chat.agent}
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              disabled={saving || !chat.agent}
              onClick={() => {
                setInstructions("");
                setEditing(true);
              }}
            >
              Reset Custom Instructions
            </button>
          </div>
        </section>
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span>{dirty ? "Unsaved changes" : "Saved on this device"}</span>
          <button disabled={saving} onClick={() => void close()}>
            Cancel
          </button>
          <button
            disabled={!dirty || saving || !chat.agent}
            onClick={async () => {
              if (saving) return;
              setSaving(true);
              setError("");
              try {
                await chat.saveAgent(instructions, avatar);
                onClose();
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Could not save agent settings.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </dialog>
      {confirmation}
    </>
  );
}
