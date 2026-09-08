"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

function ConfirmationDialog({
  message,
  label,
  onResolve,
}: {
  message: string;
  label: string;
  onResolve: (accepted: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirmation-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => {
        event.preventDefault();
        onResolve(false);
      }}
    >
      <h2 id={titleId}>{label}</h2>
      <p id={messageId}>{message}</p>
      <div className="confirmation-actions">
        <button ref={cancelRef} type="button" onClick={() => onResolve(false)}>
          Cancel
        </button>
        <button type="button" onClick={() => onResolve(true)}>
          {label}
        </button>
      </div>
    </dialog>
  );
}

// HTML dialogs stay inside Chromium. Avoid window.confirm/alert, whose native
// Windows modal loop can leave Electron's renderer unable to receive typing.
export function useConfirmation() {
  const [pending, setPending] = useState<{
    message: string;
    label: string;
  } | null>(null);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);
  const resolve = useCallback((accepted: boolean) => {
    const finish = resolver.current;
    resolver.current = null;
    setPending(null);
    finish?.(accepted);
  }, []);
  useEffect(
    () => () => {
      resolver.current?.(false);
      resolver.current = null;
    },
    [],
  );
  const confirm = useCallback(
    (message: string, label = "Confirm") =>
      new Promise<boolean>((finish) => {
        resolver.current?.(false);
        resolver.current = finish;
        setPending({ message, label });
      }),
    [],
  );
  return {
    confirm,
    confirmation: pending ? (
      <ConfirmationDialog {...pending} onResolve={resolve} />
    ) : null,
  };
}
