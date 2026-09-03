import type { KnowledgeNode, NodeLayout } from "../types/graph";

export type PlanetSemanticBand = "far" | "normal" | "near";

export interface PlanetCameraTransform {
  x: number;
  y: number;
  k: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

interface HitCandidate {
  node: KnowledgeNode;
  distance: number;
  visualRadius: number;
  hitRadius: number;
}

function typePriority(node: KnowledgeNode): number {
  if (node.type === "directory") return 0;
  if (node.fileType !== "other") return 1;
  return 2;
}

function minimumHitRadius(node: KnowledgeNode): number {
  if (node.type === "directory") return 14;
  if (node.fileType !== "other") return 11;
  return 6;
}

function rank(left: HitCandidate, right: HitCandidate): number {
  const priority = typePriority(left.node) - typePriority(right.node);
  if (priority !== 0) return priority;
  const normalizedDistance = left.distance / left.hitRadius - right.distance / right.hitRadius;
  if (normalizedDistance !== 0) return normalizedDistance;
  return left.node.id.localeCompare(right.node.id);
}

export function pickPlanetNode(
  nodes: readonly KnowledgeNode[],
  positions: ReadonlyMap<string, NodeLayout>,
  camera: PlanetCameraTransform,
  pointer: ScreenPoint,
  semanticBand: PlanetSemanticBand,
): KnowledgeNode | null {
  const candidates: HitCandidate[] = [];

  for (const node of nodes) {
    if (semanticBand === "far" && node.type === "file") continue;
    const position = positions.get(node.id);
    if (!position) continue;
    const screenX = camera.x + position.x * camera.k;
    const screenY = camera.y + position.y * camera.k;
    const distance = Math.hypot(pointer.x - screenX, pointer.y - screenY);
    const visualRadius = Math.max(2.5, position.size * camera.k / 2);
    const hitRadius = Math.max(visualRadius, minimumHitRadius(node));
    if (distance <= hitRadius) candidates.push({ node, distance, visualRadius, hitRadius });
  }

  // A pointer directly over a rendered body should not be stolen by another
  // object's larger invisible assistance area.
  const direct = candidates.filter((candidate) => candidate.distance <= candidate.visualRadius);
  const pool = direct.length > 0 ? direct : candidates;
  pool.sort(rank);
  return pool[0]?.node ?? null;
}
