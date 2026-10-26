const assert = require("node:assert/strict");
const test = require("node:test");
const { findPlanetSearchTarget, interpolatePlanetCamera } = require("./planet-navigation.ts");

const nodes = [
  { id: "notes", name: "notes", path: "notes" },
  { id: "a", name: "plan.md", path: "notes/plan.md" },
  { id: "b", name: "plan.md", path: "archive/plan.md" },
  { id: "c", name: "budget.csv", path: "notes/budget.csv" },
];

test("search prefers exact folder and normalized path, leaving duplicate names ambiguous", () => {
  assert.equal(findPlanetSearchTarget(nodes, "notes"), "notes");
  assert.equal(findPlanetSearchTarget(nodes, " NOTES\\PLAN.MD "), "a");
  assert.equal(findPlanetSearchTarget(nodes, "plan.md"), null);
  assert.equal(findPlanetSearchTarget(nodes, "budget"), "c");
  assert.equal(findPlanetSearchTarget(nodes, ""), null);
  assert.equal(findPlanetSearchTarget(nodes, "missing"), null);
});

test("flight reaches the exact destination with bounded zoom and monotonic world travel", () => {
  const from = { x: 0, y: 0, k: 0.6 };
  const to = { x: -2000, y: -1000, k: 1.6 };
  assert.deepEqual(interpolatePlanetCamera(from, to, 800, 600, 0), from);
  assert.deepEqual(interpolatePlanetCamera(from, to, 800, 600, 1), to);
  let previousX = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const camera = interpolatePlanetCamera(from, to, 800, 600, i / 100);
    assert.ok(camera.k >= 0.2 && camera.k <= 1.6);
    const x = (400 - camera.x) / camera.k;
    assert.ok(x >= previousX);
    previousX = x;
  }
  assert.ok(interpolatePlanetCamera(from, to, 800, 600, 0.25).k < from.k);
});
