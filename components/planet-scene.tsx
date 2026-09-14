import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import type { KnowledgeNode, PlanetGraph, StationCluster } from "../types/graph";
import { boxSelectPlanetNodes, pickPlanetNode } from "../lib/planet-hit-testing";
import { ancestorPath, computeLayout, computeStationLayout, subtreeIds } from "../lib/planet-layout";
import { PlanetNode } from "./planet-node";
import { PlanetMinimap } from "./planet-minimap";
import { PlanetControls } from "./planet-controls";
import { ChatPanel, type ChatPanelProps } from "./chat-panel";

export interface PlanetSceneProps {
  graph: PlanetGraph;
  selectedIds: ReadonlySet<string>;
  onSelect: (id: string | null, additive?: boolean) => void;
  onSelectMany: (ids: string[], additive: boolean) => void;
  onOpenFile: (id: string) => void;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  stationMatchIds?: ReadonlySet<string>;
  activeContextIds?: ReadonlySet<string>;
  projectionIds?: ReadonlySet<string> | null;
  stationClusters?: readonly StationCluster[];
  chatProps: Omit<ChatPanelProps, "variant">;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type SemanticZoomBand = "far" | "normal" | "near";

function isSceneOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".pmini, .pctrl, .chat-panel"));
}

export function PlanetScene({ graph, selectedIds, onSelect, onSelectMany, onOpenFile, focusId, onFocus, stationMatchIds = new Set(), activeContextIds = new Set(), projectionIds = null, stationClusters = [], chatProps }: Readonly<PlanetSceneProps>) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [canvas, setCanvas] = useState({ w: 0, h: 0 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [dragging, setDragging] = useState(false);
  const [asteroidsVisible, setAsteroidsVisible] = useState(true);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [panMode, setPanMode] = useState(false);
  const spaceHeld = useRef(false);
  const [spacePanning, setSpacePanning] = useState(false);
  useEffect(() => {
    const clear = () => { spaceHeld.current = false; setSpacePanning(false); };
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && (target.closest("input, textarea, select, [contenteditable], dialog") || isSceneOverlay(target))) return;
      const canvas = canvasRef.current;
      if (!canvas || !(canvas.matches(":hover") || (target instanceof Node && canvas.contains(target)))) return;
      event.preventDefault();
      spaceHeld.current = true;
      setSpacePanning(true);
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") clear(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);
  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean; box: boolean; additive: boolean; pointerId: number } | null>(null);

  const layout = useMemo(
    () => graph.projection === "station" ? computeStationLayout(graph, stationMatchIds, stationClusters) : computeLayout(graph, "orbital"),
    [graph, stationClusters, stationMatchIds],
  );
  const semanticBand: SemanticZoomBand = transform.k < 0.55 ? "far" : transform.k < 1.15 ? "normal" : "near";

  useEffect(() => {
    if (semanticBand !== "far" || !hoveredId) return;
    if (graph.byId.get(hoveredId)?.type === "file") setHoveredId(null);
  }, [graph, hoveredId, semanticBand]);

  const childCounts = useMemo(() => {
    const map = new Map<string, { files: number; dirs: number }>();
    for (const node of graph.nodes) {
      let files = 0;
      let dirs = 0;
      for (const childId of node.children) {
        const child = graph.byId.get(childId);
        if (child?.type === "file") files += 1;
        else dirs += 1;
      }
      map.set(node.id, { files, dirs });
    }
    return map;
  }, [graph]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of graph.nodes) map.set(node.id, new Set());
    for (const edge of graph.edges) {
      map.get(edge.source)?.add(edge.target);
      map.get(edge.target)?.add(edge.source);
    }
    return map;
  }, [graph]);

  const visibleIds = useMemo(() => {
    if (focusId) return subtreeIds(graph, focusId);
    return null;
  }, [graph, focusId]);

  // Measure the canvas.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setCanvas({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pickAt = useCallback((clientX: number, clientY: number) => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return null;
    const rect = canvasElement.getBoundingClientRect();
    const candidates = graph.nodes.filter((node) => {
      if (!asteroidsVisible && node.fileType === "other") return false;
      if (visibleIds && !visibleIds.has(node.id)) return false;
      if (projectionIds && !projectionIds.has(node.id)) return false;
      return true;
    });
    return pickPlanetNode(
      candidates,
      layout.positions,
      transform,
      { x: clientX - rect.left, y: clientY - rect.top },
      semanticBand,
    );
  }, [asteroidsVisible, graph, layout.positions, projectionIds, semanticBand, transform, visibleIds]);

  const fitView = useCallback(() => {
    if (canvas.w === 0 || canvas.h === 0) return;
    const pad = 48;
    const k = clamp(Math.min((canvas.w - pad * 2) / layout.width, (canvas.h - pad * 2) / layout.height), 0.2, 1.5);
    setTransform({ x: canvas.w / 2 - (layout.width / 2) * k, y: canvas.h / 2 - (layout.height / 2) * k, k });
  }, [canvas, layout]);

  // Fit on first measurement and whenever the layout changes (mode switch).
  useEffect(() => {
    fitView();
  }, [fitView, layout]);

  const focusOnNode = useCallback(
    (id: string) => {
      const pos = layout.positions.get(id);
      if (!pos || canvas.w === 0) return;
      const k = clamp(Math.max(transform.k, 1.05), 0.2, 4);
      setTransform({ x: canvas.w / 2 - pos.x * k, y: canvas.h / 2 - pos.y * k, k });
    },
    [layout, canvas, transform.k],
  );

  const handleOpen = useCallback(
    (id: string) => {
      const node = graph.byId.get(id);
      if (!node) return;
      if (node.type === "directory") {
        onFocus(id);
      } else {
        onOpenFile(id);
      }
    },
    [graph, onFocus, onOpenFile],
  );

  const resetView = useCallback(() => {
    onFocus(null);
    fitView();
  }, [onFocus, fitView]);

  // Center on the focused node whenever focus changes (double-click, breadcrumb, or details panel).
  useEffect(() => {
    if (focusId) focusOnNode(focusId);
  }, [focusId, focusOnNode]);

  const zoomBy = useCallback((factor: number) => {
    setTransform((t) => {
      const k = clamp(t.k * factor, 0.2, 4);
      const cx = canvas.w / 2;
      const cy = canvas.h / 2;
      return { x: cx - (cx - t.x) * (k / t.k), y: cy - (cy - t.y) * (k / t.k), k };
    });
  }, [canvas]);

  // Native non-passive wheel listener so we can preventDefault.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (isSceneOverlay(event.target)) return;
      event.preventDefault();
      if (dragStart.current) return;
      const rect = el.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      setTransform((t) => {
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        const k = clamp(t.k * factor, 0.2, 4);
        return { x: mx - (mx - t.x) * (k / t.k), y: my - (my - t.y) * (k / t.k), k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isSceneOverlay(event.target) || dragStart.current || ![0, 1].includes(event.button)) return;
    event.preventDefault();
    event.currentTarget.focus();
    setDragging(true);
    dragStart.current = { px: event.clientX, py: event.clientY, ox: transform.x, oy: transform.y, moved: false, box: event.button === 0 && !spaceHeld.current && !panMode, additive: event.shiftKey, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (isSceneOverlay(event.target)) {
      setHoveredId(null);
      return;
    }
    const start = dragStart.current;
    if (start && start.pointerId !== event.pointerId) return;
    if (!start) {
      setHoveredId(pickAt(event.clientX, event.clientY)?.id ?? null);
      return;
    }
    const dx = event.clientX - start.px;
    const dy = event.clientY - start.py;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      start.moved = true;
      setHoveredId(null);
    }
    if (start.box) {
      if (start.moved) {
        const rect = event.currentTarget.getBoundingClientRect();
        setSelectionBox({ x: Math.min(start.px, event.clientX) - rect.left, y: Math.min(start.py, event.clientY) - rect.top, w: Math.abs(dx), h: Math.abs(dy) });
      }
    } else setTransform((t) => ({ ...t, x: start.ox + dx, y: start.oy + dy }));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || dragStart.current.pointerId !== event.pointerId) return;
    const start = dragStart.current;
    const moved = dragStart.current?.moved ?? false;
    dragStart.current = null;
    setDragging(false);
    setSelectionBox(null);
    if (moved && start.box) {
      const rect = event.currentTarget.getBoundingClientRect();
      const ids = boxSelectPlanetNodes(graph.nodes.filter(isVisible), layout.positions, transform, { x: start.px - rect.left, y: start.py - rect.top }, { x: event.clientX - rect.left, y: event.clientY - rect.top }, semanticBand);
      onSelectMany(ids.filter((id) => id !== graph.rootId), start.additive);
    } else if (!moved && event.button === 0 && start.box) {
      const picked = pickAt(event.clientX, event.clientY);
      onSelect(picked?.id ?? null, picked ? event.shiftKey : false);
      setHoveredId(picked?.id ?? null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelDrag = () => {
    const pointerId = dragStart.current?.pointerId;
    dragStart.current = null;
    setDragging(false);
    setSelectionBox(null);
    if (pointerId !== undefined && canvasRef.current?.hasPointerCapture(pointerId)) canvasRef.current.releasePointerCapture(pointerId);
  };

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isSceneOverlay(event.target)) return;
    const picked = pickAt(event.clientX, event.clientY);
    if (picked) handleOpen(picked.id);
  };

  // Derived visibility + highlight sets.
  const selectedId = [...selectedIds].at(-1) ?? null;
  const activeId = hoveredId ?? selectedId;
  const related = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const neighbor of adjacency.get(activeId) ?? []) set.add(neighbor);
    for (const cluster of stationClusters) if (cluster.memberIds.includes(activeId)) {
      for (const memberId of cluster.memberIds) set.add(memberId);
    }
    return set;
  }, [activeId, adjacency, stationClusters]);

  const isVisible = (node: KnowledgeNode): boolean => {
    if (!asteroidsVisible && node.fileType === "other") return false;
    if (visibleIds && !visibleIds.has(node.id)) return false;
    if (projectionIds && !projectionIds.has(node.id)) return false;
    return true;
  };

  const breadcrumb = useMemo(() => (focusId ? ancestorPath(graph, focusId) : []), [graph, focusId]);

  const viewport = {
    x: (0 - transform.x) / transform.k,
    y: (0 - transform.y) / transform.k,
    w: canvas.w / transform.k,
    h: canvas.h / transform.k,
  };

  const jump = useCallback(
    (worldX: number, worldY: number) => {
      setTransform((t) => ({ ...t, x: canvas.w / 2 - worldX * t.k, y: canvas.h / 2 - worldY * t.k }));
    },
    [canvas],
  );

  return (
    <section className="planet-view">
      <div className="planet-view-header">
        <span>PLANET VIEW</span>
        {breadcrumb.length > 0 ? (
          <span className="pv-crumbs">
            {breadcrumb.map((id, index) => {
              const node = graph.byId.get(id);
              return (
                <span key={id}>
                  {index > 0 ? <span className="pv-sep">▸</span> : null}
                  <button className="pv-crumb" onClick={() => onFocus(id)}>
                    {node?.name ?? id}
                  </button>
                </span>
              );
            })}
          </span>
        ) : (
          <span className="planet-view-hint">Drag to {panMode ? "pan" : "select"} · Shift adds · Space + drag pans</span>
        )}
        <button type="button" aria-pressed={panMode} onClick={() => setPanMode(!panMode)}>{panMode ? "Pan mode" : "Select mode"}</button>
        <span className="pv-count">{selectedIds.size} SELECTED · {graph.nodes.length} NODES</span>
      </div>

      <div
        className={`planet-canvas pv-canvas${hoveredId ? " has-pick" : ""}`}
        ref={canvasRef}
        tabIndex={0}
        aria-label="Planet View selection canvas"
        style={{ touchAction: "none", cursor: panMode || spacePanning ? "grab" : "crosshair" }}
        onKeyDown={(event) => { if (event.key === "Escape" && !isSceneOverlay(event.target)) cancelDrag(); }}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (!dragStart.current) setHoveredId(null);
        }}
        onDoubleClick={onDoubleClick}
      >
        <div
          className={`pworld semantic-${semanticBand}${dragging ? "" : " smooth"}`}
          style={{ width: `${layout.width}px`, height: `${layout.height}px`, transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.k})` }}
        >
          <svg className="pedges" width={layout.width} height={layout.height}>
              {stationClusters.flatMap((cluster) => {
                const hub = layout.contextHubs?.get(cluster.id);
                if (!hub) return [];
                return cluster.memberIds.map((memberId) => {
                  const member = layout.positions.get(memberId);
                  const node = graph.byId.get(memberId);
                  if (!member || !node || !isVisible(node)) return null;
                  return <line key={`${cluster.id}->${memberId}`} className="pedge pedge-station-member" x1={hub.x} y1={hub.y} x2={member.x} y2={member.y} />;
                });
              })}
              {graph.edges.map((edge) => {
                // Structure mode shows its hierarchy; Context Sorting shows
                // only semantic links between direct Station matches.
                if (graph.projection === "station" && edge.kind !== "secondary") return null;
                const a = layout.positions.get(edge.source);
                const b = layout.positions.get(edge.target);
                if (!a || !b) return null;
                const sNode = graph.byId.get(edge.source);
                const tNode = graph.byId.get(edge.target);
                if (!sNode || !tNode) return null;
                if (!isVisible(sNode) || !isVisible(tNode)) return null;
                const dim = related && !(related.has(edge.source) && related.has(edge.target));
                const cls = [
                  "pedge",
                  edge.kind === "secondary" ? "pedge-sec" : tNode.type === "file" ? "pedge-file" : "pedge-dir",
                  tNode.fileType === "other" ? "pedge-asteroid" : "",
                  dim ? "dim" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return <line key={`${edge.source}->${edge.target}`} className={cls} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
              })}
            </svg>

          {graph.nodes.map((node) => {
            const pos = layout.positions.get(node.id);
            if (!pos) return null;
            if (!isVisible(node)) return null;
            const counts = childCounts.get(node.id) ?? { files: 0, dirs: 0 };
            const dimmed = related ? !related.has(node.id) : false;
            const emphasized = related ? related.has(node.id) && node.id !== activeId : false;
            return (
              <PlanetNode
                key={node.id}
                node={node}
                layout={pos}
                selected={selectedIds.has(node.id)}
                hovered={hoveredId === node.id}
                dimmed={dimmed}
                emphasized={emphasized}
                stationMatch={stationMatchIds.has(node.id)}
                activeContext={activeContextIds.has(node.id)}
                structural={Boolean(projectionIds && !stationMatchIds.has(node.id))}
                semanticBand={semanticBand}
                showLabel={node.type === "directory" || (semanticBand === "near" && node.fileType !== "other")}
                childFiles={counts.files}
                childDirs={counts.dirs}
                onHover={setHoveredId}
                onSelect={onSelect}
                onOpen={handleOpen}
              />
            );
          })}

          {[...(layout.contextHubs?.values() ?? [])].map((hub) => (
            <div key={hub.id} className="pcontext-hub" style={{ left: hub.x, top: hub.y }}>
              <span className="pcontext-hub-orb" />
              <span>{hub.name}</span>
            </div>
          ))}
        </div>

        {selectionBox ? <div aria-hidden="true" style={{ position: "absolute", pointerEvents: "none", zIndex: 5, left: selectionBox.x, top: selectionBox.y, width: selectionBox.w, height: selectionBox.h, border: "1px solid #b4d8bb", background: "rgba(140, 190, 150, 0.18)" }} /> : null}
        <PlanetMinimap graph={graph} layout={layout} viewport={viewport} focusId={focusId} asteroidsVisible={asteroidsVisible} onJump={jump} />
        <ChatPanel variant="floating" {...chatProps} />
        <PlanetControls
          onZoomIn={() => zoomBy(1.01)}
          onZoomOut={() => zoomBy(1 / 1.01)}
          zoomPercent={Math.round(transform.k * 100)}
          onFocus={() => selectedId && focusOnNode(selectedId)}
          onReset={resetView}
          asteroidsVisible={asteroidsVisible}
          onToggleAsteroids={() => {
            if (asteroidsVisible && selectedId && graph.byId.get(selectedId)?.fileType === "other") onSelect(null);
            setAsteroidsVisible((visible) => !visible);
          }}
        />
      </div>

      </section>
  );
}
