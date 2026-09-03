import type { Station, StationAssignment } from "../types/electron";
import type { PlanetGraph, StationCluster } from "../types/graph";

export type StationMatchMode = "any" | "all";

export function stationProjection(graph: PlanetGraph, stations: Station[], assignments: StationAssignment[], activeStationIds: ReadonlySet<string>, mode: StationMatchMode) {
  if (activeStationIds.size === 0) return { graph, matches: new Set<string>(), visible: null as Set<string> | null, clusters: [] as StationCluster[] };
  const byPath = new Map(assignments.filter((item) => !item.missing).map((item) => [item.relativePath, new Set(item.stationIds)]));
  const matches = new Set<string>();
  for (const [id, stationIds] of byPath) {
    const matching = [...activeStationIds].filter((stationId) => stationIds.has(stationId)).length;
    if ((mode === "any" && matching > 0) || (mode === "all" && matching === activeStationIds.size)) matches.add(id);
  }
  const visible = new Set<string>([graph.rootId]);
  for (const id of matches) {
    let node = graph.byId.get(id);
    while (node) { visible.add(node.id); node = node.parentId ? graph.byId.get(node.parentId) : undefined; }
  }
  const stationNames = new Map(stations.map((station) => [station.id, station.name]));
  const clusters: StationCluster[] = [...activeStationIds].sort().map((stationId) => ({
    id: stationId,
    name: stationNames.get(stationId) ?? "Unknown Station",
    memberIds: [...matches].filter((id) => byPath.get(id)?.has(stationId)).sort(),
  }));
  const nodes = graph.nodes.filter((node) => visible.has(node.id)).map((node) => ({ ...node, children: node.children.filter((id) => visible.has(id)) }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const hierarchy = graph.edges.filter((edge) => edge.kind === "hierarchy" && visible.has(edge.source) && visible.has(edge.target));
  const connectionCount = clusters.reduce((sum, cluster) => sum + cluster.memberIds.length, 0);
  return { graph: { ...graph, nodes, byId, edges: hierarchy, projection: "station" as const, stats: { directories: nodes.filter((node) => node.type === "directory").length, files: nodes.filter((node) => node.type === "file").length, connections: connectionCount, orphans: 0 } }, matches, visible, clusters };
}
