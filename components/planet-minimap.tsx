import type { MouseEvent } from "react";
import type { LayoutResult, PlanetGraph } from "../types/graph";

export interface PlanetMinimapProps {
  graph: PlanetGraph;
  layout: LayoutResult;
  viewport: { x: number; y: number; w: number; h: number };
  focusId: string | null;
  asteroidsVisible: boolean;
  onJump: (worldX: number, worldY: number) => void;
}

const MM_W = 156;
const MM_H = 120;

export function PlanetMinimap({ graph, layout, viewport, focusId, asteroidsVisible, onJump }: Readonly<PlanetMinimapProps>) {
  const scale = Math.min(MM_W / layout.width, MM_H / layout.height);
  const offsetX = (MM_W - layout.width * scale) / 2;
  const offsetY = (MM_H - layout.height * scale) / 2;

  const toMini = (x: number, y: number) => ({ x: offsetX + x * scale, y: offsetY + y * scale });

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const worldX = (mx - offsetX) / scale;
    const worldY = (my - offsetY) / scale;
    onJump(worldX, worldY);
  };

  const vp = {
    x: offsetX + viewport.x * scale,
    y: offsetY + viewport.y * scale,
    w: viewport.w * scale,
    h: viewport.h * scale,
  };

  return (
    <div className="pmini">
      <div className="pmini-head">MAP</div>
      <svg width={MM_W} height={MM_H} onClick={handleClick} className="pmini-svg">
        {graph.nodes.map((node) => {
          const pos = layout.positions.get(node.id);
          if (!pos) return null;
          if (!asteroidsVisible && node.fileType === "other") return null;
          if (focusId) {
            const inFocus =
              node.id === focusId || node.path.startsWith(focusId + "/") || focusId.startsWith(node.id + "/");
            if (!inFocus) return null;
          }
          const m = toMini(pos.x, pos.y);
          return (
            <circle
              key={node.id}
              cx={m.x}
              cy={m.y}
              r={node.type === "directory" ? 2.1 : 1.1}
              className={node.type === "directory" ? "pmini-dir" : `pmini-file pmini-file-${node.fileType ?? "unknown"}`}
            />
          );
        })}
        <rect
          x={vp.x}
          y={vp.y}
          width={vp.w}
          height={vp.h}
          className="pmini-view"
        />
      </svg>
    </div>
  );
}
