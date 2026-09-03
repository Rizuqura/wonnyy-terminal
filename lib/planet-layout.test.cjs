const assert = require("node:assert/strict");
const test = require("node:test");

const { computeLayout, computeStationLayout } = require("./planet-layout.ts");
const { stationProjection } = require("./station-projection.ts");

function node(id, type, parentId, children = [], fileType) {
  return {
    id,
    name: id,
    type,
    parentId,
    path: id,
    fileType,
    children,
    connections: [],
    level: id.split("/").length - 1,
  };
}

function graph(nodes, edges = [], projection = "filesystem") {
  return {
    nodes,
    edges,
    rootId: "root",
    byId: new Map(nodes.map((item) => [item.id, item])),
    projection,
    stats: { directories: 0, files: 0, connections: 0, orphans: 0 },
  };
}

function distance(layout, left, right) {
  const a = layout.positions.get(left);
  const b = layout.positions.get(right);
  assert.ok(a && b);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test("direct files stay close to their directory when a large nested system exists", () => {
  const directFiles = Array.from({ length: 12 }, (_, index) => `root/file-${index}.md`);
  const nestedFiles = Array.from({ length: 14 }, (_, index) => `root/archive/item-${index}.pdf`);
  const nodes = [
    node("root", "directory", undefined, [...directFiles, "root/archive"]),
    ...directFiles.map((id) => node(id, "file", "root", [], "md")),
    node("root/archive", "directory", "root", nestedFiles),
    ...nestedFiles.map((id) => node(id, "file", "root/archive", [], "pdf")),
  ];
  const layout = computeLayout(graph(nodes), "orbital");
  const fileDistances = directFiles.map((id) => distance(layout, "root", id));
  const archiveDistance = distance(layout, "root", "root/archive");

  assert.ok(Math.max(...fileDistances) < archiveDistance, "direct files must occupy inner parent belts");
  assert.ok(nestedFiles.every((id) => distance(layout, "root/archive", id) < archiveDistance));
});

test("orbital output is deterministic, finite, and keeps asteroid files nearest", () => {
  const nodes = [
    node("root", "directory", undefined, ["root/a", "root/b"]),
    node("root/a", "directory", "root", ["root/a/readme", "root/a/blob"]),
    node("root/a/readme", "file", "root/a", [], "md"),
    node("root/a/blob", "file", "root/a", [], "other"),
    node("root/b", "directory", "root", ["root/b/deep"]),
    node("root/b/deep", "directory", "root/b", ["root/b/deep/data"]),
    node("root/b/deep/data", "file", "root/b/deep", [], "csv"),
  ];
  const first = computeLayout(graph(nodes), "orbital");
  const second = computeLayout(graph(nodes), "orbital");

  assert.deepEqual([...first.positions], [...second.positions]);
  assert.equal(first.positions.size, nodes.length);
  for (const position of first.positions.values()) {
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
  }
  assert.ok(distance(first, "root/a", "root/a/blob") < distance(first, "root/a", "root/a/readme"));

  const branchRadius = (anchorId, descendantIds) => {
    const anchor = first.positions.get(anchorId);
    return Math.max(...descendantIds.map((id) => {
      const descendant = first.positions.get(id);
      return Math.hypot(descendant.x - anchor.x, descendant.y - anchor.y) + descendant.size / 2;
    }));
  };
  const aRadius = branchRadius("root/a", ["root/a/readme", "root/a/blob"]);
  const bRadius = branchRadius("root/b", ["root/b/deep", "root/b/deep/data"]);
  assert.ok(distance(first, "root/a", "root/b") >= aRadius + bRadius, "sibling branch footprints must not overlap");
});

test("Station hubs organize matches without abandoning their families", () => {
  const nodes = [
    node("root", "directory", undefined, ["root/alpha", "root/beta"]),
    node("root/alpha", "directory", "root", ["root/alpha/a.md"]),
    node("root/alpha/a.md", "file", "root/alpha", [], "md"),
    node("root/beta", "directory", "root", ["root/beta/b.md"]),
    node("root/beta/b.md", "file", "root/beta", [], "md"),
  ];
  const stationGraph = graph(nodes, [], "station");
  const base = computeLayout(stationGraph, "orbital");
  const clusters = [{ id: "research", name: "Research", memberIds: ["root/alpha/a.md", "root/beta/b.md"] }];
  const station = computeStationLayout(stationGraph, new Set(clusters[0].memberIds), clusters);

  assert.equal(station.contextHubs?.get("research")?.name, "Research");
  assert.notDeepEqual([...station.positions], [...base.positions]);
  assert.ok(distance(station, "root/alpha", "root/alpha/a.md") < 320);
  assert.ok(distance(station, "root/beta", "root/beta/b.md") < 320);
});

test("Station projection preserves separate networks and shared membership", () => {
  const nodes = [
    node("root", "directory", undefined, ["root/a.md", "root/b.md", "root/shared.md"]),
    node("root/a.md", "file", "root", [], "md"),
    node("root/b.md", "file", "root", [], "md"),
    node("root/shared.md", "file", "root", [], "md"),
  ];
  const stations = [{ id: "alpha", name: "Alpha" }, { id: "beta", name: "Beta" }];
  const assignments = [
    { relativePath: "root/a.md", stationIds: ["alpha"], missing: false },
    { relativePath: "root/b.md", stationIds: ["beta"], missing: false },
    { relativePath: "root/shared.md", stationIds: ["alpha", "beta"], missing: false },
  ];
  const projection = stationProjection(graph(nodes), stations, assignments, new Set(["alpha", "beta"]), "any");

  assert.deepEqual(projection.clusters[0], { id: "alpha", name: "Alpha", memberIds: ["root/a.md", "root/shared.md"] });
  assert.deepEqual(projection.clusters[1], { id: "beta", name: "Beta", memberIds: ["root/b.md", "root/shared.md"] });
  assert.equal(projection.graph.stats.connections, 4);
});
