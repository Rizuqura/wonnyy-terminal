import { useEffect, useRef } from "react";
import type { PointerEvent, ReactNode } from "react";
export interface PlanetControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomPercent: number;
  onFocus: () => void;
  onReset: () => void;
  asteroidsVisible: boolean;
  onToggleAsteroids: () => void;
}

export function PlanetControls({ onZoomIn, onZoomOut, zoomPercent, onFocus, onReset, asteroidsVisible, onToggleAsteroids }: Readonly<PlanetControlsProps>) {
  return <div className="pctrl" onPointerDown={(event) => event.stopPropagation()}>
    <section className="pctrl-guide" aria-label="Planet View control guide">
      <b>CONTROLS</b>
      <dl>
        <div><dt>Drag in Select mode</dt><dd>Select a group</dd></div>
        <div><dt>Shift + drag</dt><dd>Add to selection</dd></div>
        <div><dt>Shift + click</dt><dd>Toggle one object</dd></div>
        <div><dt>Space + drag</dt><dd>Pan the view</dd></div>
        <div><dt>Scroll</dt><dd>Zoom</dd></div>
        <div><dt>Double-click</dt><dd>Open file / focus folder</dd></div>
        <div><dt>Escape</dt><dd>Cancel selection drag</dd></div>
      </dl>
      <p>Use Pan mode for ordinary dragging. After selecting, use + beside a Station to assign the group.</p>
    </section>
    <label className="pctrl-check">
      <input type="checkbox" checked={asteroidsVisible} onChange={onToggleAsteroids} />
      <span className="pctrl-box" aria-hidden="true">{asteroidsVisible ? "[x]" : "[ ]"}</span>
      ASTEROID VISIBLE
    </label>
    <div className="pctrl-zoom">
      <RepeatButton onTrigger={onZoomIn} ariaLabel="Zoom in by 1 percent">+</RepeatButton>
      <RepeatButton onTrigger={onZoomOut} ariaLabel="Zoom out by 1 percent">−</RepeatButton>
      <output className="pctrl-zoom-level" aria-live="polite">{zoomPercent}%</output>
      <button onClick={onFocus} aria-label="Focus selected">⌖</button>
      <button onClick={onReset} aria-label="Reset view">⟲</button>
    </div>
  </div>;
}

function RepeatButton({ children, onTrigger, ariaLabel }: Readonly<{ children: ReactNode; onTrigger: () => void; ariaLabel: string }>) {
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (repeatRef.current) clearInterval(repeatRef.current);
    delayRef.current = null;
    repeatRef.current = null;
  };
  useEffect(() => stop, []);
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    stop();
    onTrigger();
    delayRef.current = setTimeout(() => { repeatRef.current = setInterval(onTrigger, 80); }, 320);
  };
  return <button aria-label={ariaLabel} title={`${ariaLabel} · hold to repeat`} onPointerDown={start} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={(event) => { if (event.buttons === 0) stop(); }}>{children}</button>;
}
