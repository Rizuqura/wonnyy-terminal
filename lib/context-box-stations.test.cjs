const test = require("node:test");
const assert = require("node:assert/strict");
const { contextBoxStations } = require("./context-box-stations.ts");
const { stationProjection } = require("./station-projection.ts");

const boxes = [
  {
    id: "a",
    name: "Alpha",
    createdAt: "now",
    updatedAt: "now",
    items: [{ relativePath: "a.md" }],
  },
  {
    id: "ab",
    name: "Both",
    createdAt: "now",
    updatedAt: "now",
    items: [
      { relativePath: "a.md" },
      { relativePath: "b.md" },
      { relativePath: "missing.md" },
    ],
  },
];
const stations = [
  {
    id: "legacy",
    name: "Legacy",
    createdAt: "now",
    updatedAt: "now",
    assignmentCount: 1,
  },
];
const assignments = [
  {
    relativePath: "b.md",
    kind: "file",
    stationIds: ["legacy"],
    missing: false,
  },
];
const nodes = [
  {
    id: "root",
    type: "directory",
    parentId: null,
    children: ["a.md", "b.md", "other.md"],
  },
  ...["a.md", "b.md", "other.md"].map((id) => ({
    id,
    type: "file",
    parentId: "root",
    children: [],
  })),
];
const graph = {
  rootId: "root",
  nodes,
  byId: new Map(nodes.map((node) => [node.id, node])),
  edges: [],
  stats: {},
};
const paths = new Set(graph.byId.keys());
function project(activeStations, activeBoxes, mode, currentBoxes = boxes) {
  const combined = contextBoxStations(
    stations,
    assignments,
    currentBoxes,
    new Set(activeStations),
    new Set(activeBoxes),
    paths,
  );
  return stationProjection(
    graph,
    combined.stations,
    combined.assignments,
    combined.activeIds,
    mode,
  );
}
test("boxes and legacy Stations share ANY union and ALL intersection without mutating memberships", () => {
  const before = JSON.stringify({ boxes, stations, assignments });
  assert.deepEqual([...project([], ["a", "ab"], "any").matches].sort(), [
    "a.md",
    "b.md",
  ]);
  assert.deepEqual([...project([], ["a", "ab"], "all").matches], ["a.md"]);
  assert.deepEqual([...project(["legacy"], ["a"], "any").matches].sort(), [
    "a.md",
    "b.md",
  ]);
  assert.deepEqual([...project(["legacy"], ["a"], "all").matches], []);
  assert.deepEqual([...project(["legacy"], ["ab"], "all").matches], ["b.md"]);
  assert.equal(JSON.stringify({ boxes, stations, assignments }), before);
});
test("turning filters off restores the universe; renamed, edited, empty and deleted boxes project current membership only", () => {
  assert.equal(project([], [], "any").graph, graph);
  const renamed = [{ ...boxes[0], name: "Renamed" }];
  assert.equal(project([], ["a"], "any", renamed).clusters[0].name, "Renamed");
  assert.deepEqual(
    [
      ...project([], ["a"], "any", [
        { ...boxes[0], items: [{ relativePath: "b.md" }] },
      ]).matches,
    ],
    ["b.md"],
  );
  assert.deepEqual(
    [...project([], ["a"], "any", [{ ...boxes[0], items: [] }]).matches],
    [],
  );
  assert.equal(project([], ["a"], "any", []).graph, graph);
});
