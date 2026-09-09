"use client";

import { useRef, type ReactNode, type PointerEvent } from "react";

export function ResizableChat({
  children,
  width,
  onResize,
}: {
  children: ReactNode;
  width: number;
  onResize: (width: number) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const resize = (next: number) => {
    const grid = panel.current?.parentElement;
    if (!grid) return;
    const sidebar =
      grid.firstElementChild?.getBoundingClientRect().width ?? 193;
    onResize(
      Math.round(
        Math.max(260, Math.min(next, grid.clientWidth - sidebar - 320)),
      ),
    );
  };
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div className="workspace-chat" ref={panel}>
      <div
        className="workspace-chat-divider"
        role="separator"
        tabIndex={0}
        aria-label="Resize chat panel"
        aria-orientation="vertical"
        aria-valuemin={260}
        aria-valuenow={width}
        aria-valuetext={`${width} pixels requested`}
        title="Drag to resize chat. Arrow keys adjust width; double-click to reset."
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          drag.current = {
            x: event.clientX,
            width: panel.current!.getBoundingClientRect().width,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            resize(drag.current.width + drag.current.x - event.clientX);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onDoubleClick={() => resize(320)}
        onKeyDown={(event) => {
          if (
            event.key !== "ArrowLeft" &&
            event.key !== "ArrowRight" &&
            event.key !== "Home"
          )
            return;
          event.preventDefault();
          const current = panel.current?.getBoundingClientRect().width ?? width;
          resize(
            event.key === "Home"
              ? 320
              : current + (event.key === "ArrowLeft" ? 20 : -20),
          );
        }}
      />
      {children}
    </div>
  );
}
