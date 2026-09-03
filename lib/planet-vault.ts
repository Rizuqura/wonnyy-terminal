import type { VaultEntry, VaultSnapshot } from "../types/electron";
import type { KnowledgeNode, PlanetEdge, PlanetGraph } from "../types/graph";

// Build the Planet View graph from the real indexed vault (the /bank folder
// structure). Falls back to the mock graph when the desktop bridge is absent.
export function buildGraphFromVault(snapshot: VaultSnapshot): PlanetGraph | null {
  if (snapshot.status !== "ready") return null;

  const rootName = snapshot.rootPath.split(/[\\/]/).filter(Boolean).pop() ?? "VAULT";
  const rootId = snapshot.rootPath;
  const nodes: KnowledgeNode[] = [];
  const edges: PlanetEdge[] = [];

  const root: KnowledgeNode = {
    id: rootId,
    name: rootName,
    type: "directory",
    path: rootId,
    children: [],
    connections: [],
    level: 0,
  };
  nodes.push(root);

  const walk = (entries: VaultEntry[], parentId: string, level: number): void => {
    for (const entry of entries) {
      const isDir = entry.kind === "folder";
      const fileType =
        entry.extension === ".csv"
          ? "csv"
          : entry.extension === ".pdf"
            ? "pdf"
            : entry.extension === ".md" || entry.extension === ".markdown"
              ? "md"
              : isDir ? undefined : "other";
      const node: KnowledgeNode = {
        id: entry.relativePath,
        name: entry.name,
        type: isDir ? "directory" : "file",
        parentId,
        path: entry.relativePath,
        fileType,
        extension: entry.extension,
        children: [],
        connections: [],
        level,
      };
      nodes.push(node);
      (nodes.find((n) => n.id === parentId)?.children ?? []).push(node.id);
      edges.push({ source: parentId, target: node.id, kind: "hierarchy" });
      if (isDir && entry.children) walk(entry.children, node.id, level + 1);
    }
  };

  walk(snapshot.entries, rootId, 1);

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const directories = nodes.filter((node) => node.type === "directory").length;
  const files = nodes.length - directories;

  return {
    nodes,
    edges,
    rootId,
    byId,
    stats: { directories, files, connections: 0, orphans: 0 },
  };
}
