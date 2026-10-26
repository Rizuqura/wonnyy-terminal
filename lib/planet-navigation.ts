import type { KnowledgeNode } from "../types/graph";

export interface PlanetCamera { x: number; y: number; k: number }

// Ambiguous searches wait for the user to choose a result.
export function findPlanetSearchTarget(nodes: readonly KnowledgeNode[], query: string): string | null {
  const normalize = (value: string) => value.trim().replaceAll("\\", "/").toLocaleLowerCase();
  const term = normalize(query);
  if (!term) return null;
  const paths = nodes.filter((node) => normalize(node.path) === term);
  if (paths.length === 1) return paths[0].id;
  const names = nodes.filter((node) => normalize(node.name) === term);
  if (names.length === 1) return names[0].id;
  const matches = nodes.filter((node) => normalize(node.name).includes(term) || normalize(node.path).includes(term));
  return matches.length === 1 ? matches[0].id : null;
}

// Travel in world coordinates, pulling back on long trips before approaching.
export function interpolatePlanetCamera(from: PlanetCamera, to: PlanetCamera, width: number, height: number, progress: number): PlanetCamera {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const t = progress * progress * (3 - 2 * progress);
  const start = { x: (width / 2 - from.x) / from.k, y: (height / 2 - from.y) / from.k };
  const end = { x: (width / 2 - to.x) / to.k, y: (height / 2 - to.y) / to.k };
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const pullback = Math.min(1.2, distance * Math.min(from.k, to.k) / Math.max(width, height, 1));
  const k = Math.max(0.2, Math.exp(Math.log(from.k) * (1 - t) + Math.log(to.k) * t - Math.sin(Math.PI * t) * pullback));
  return { x: width / 2 - (start.x + (end.x - start.x) * t) * k, y: height / 2 - (start.y + (end.y - start.y) * t) * k, k };
}
