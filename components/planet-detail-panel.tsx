"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";

const defaults = { width: 360, height: 300 };
const storageKey = "qterminal-planet-detail-size-v1";

export function PlanetDetailPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    width: number;
    height: number;
    previous: typeof defaults;
  } | null>(null);
  const [preferred, setPreferred] = useState(defaults);
  const [limits, setLimits] = useState({
    narrow: false,
    width: 640,
    height: 500,
  });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (Number.isFinite(saved?.width) && Number.isFinite(saved?.height))
        setPreferred({
          width: Math.max(260, Math.min(640, saved.width)),
          height: Math.max(180, Math.min(1200, saved.height)),
        });
    } catch {}
    const parent = panel.current?.parentElement;
    if (!parent) return;
    const vault = parent.querySelector(".sidebar-slot");
    const measure = () =>
      setLimits({
        narrow: window.innerWidth <= 760,
        width: Math.max(
          260,
          Math.min(
            640,
            parent.clientWidth -
              (vault?.getBoundingClientRect().width ?? 0) -
              240,
          ),
        ),
        height: Math.max(180, parent.clientHeight - 160),
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    if (vault) observer.observe(vault);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const width = Math.min(limits.width, Math.max(260, preferred.width));
  const height = Math.min(limits.height, Math.max(180, preferred.height));
  const save = (value: typeof defaults) => {
    setPreferred(value);
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {}
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    save(preferred);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <aside
      ref={panel}
      className="planet-detail-panel"
      aria-label="Planet details and context"
      style={{
        width: limits.narrow ? undefined : width,
        height: limits.narrow ? height : undefined,
      }}
    >
      <div
        className="planet-detail-resize"
        role="separator"
        tabIndex={0}
        aria-label="Resize Planet details and context"
        aria-orientation={limits.narrow ? "horizontal" : "vertical"}
        aria-valuemin={limits.narrow ? 180 : 260}
        aria-valuemax={limits.narrow ? limits.height : limits.width}
        aria-valuenow={limits.narrow ? height : width}
        title="Drag to resize. Arrow keys adjust; Home or double-click resets. Escape cancels a drag."
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          drag.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            width,
            height,
            previous: preferred,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.pointerId !== event.pointerId) return;
          setPreferred(
            limits.narrow
              ? {
                  ...preferred,
                  height: Math.round(
                    Math.max(
                      180,
                      Math.min(
                        limits.height,
                        start.height + start.y - event.clientY,
                      ),
                    ),
                  ),
                }
              : {
                  ...preferred,
                  width: Math.round(
                    Math.max(
                      260,
                      Math.min(
                        limits.width,
                        start.width + start.x - event.clientX,
                      ),
                    ),
                  ),
                },
          );
        }}
        onPointerUp={finish}
        onPointerCancel={(event) => {
          const previous = drag.current?.previous;
          drag.current = null;
          if (previous) setPreferred(previous);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onDoubleClick={() => save(defaults)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && drag.current) {
            const start = drag.current;
            drag.current = null;
            setPreferred(start.previous);
            if (event.currentTarget.hasPointerCapture(start.pointerId))
              event.currentTarget.releasePointerCapture(start.pointerId);
            return;
          }
          const keys = limits.narrow
            ? ["ArrowUp", "ArrowDown"]
            : ["ArrowLeft", "ArrowRight"];
          if (event.key === "Home") {
            event.preventDefault();
            save(defaults);
          } else if (keys.includes(event.key)) {
            event.preventDefault();
            const delta =
              (event.shiftKey ? 40 : 10) * (event.key === keys[0] ? 1 : -1);
            save(
              limits.narrow
                ? {
                    ...preferred,
                    height: Math.max(
                      180,
                      Math.min(limits.height, height + delta),
                    ),
                  }
                : {
                    ...preferred,
                    width: Math.max(260, Math.min(limits.width, width + delta)),
                  },
            );
          }
        }}
      />
      {children}
    </aside>
  );
}
