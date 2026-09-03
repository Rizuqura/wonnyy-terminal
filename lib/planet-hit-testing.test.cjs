const assert = require("node:assert/strict");
const test = require("node:test");

const { pickPlanetNode } = require("./planet-hit-testing.ts");

function node(id, type, fileType) {
  return { id, name: id, type, fileType, path: id, children: [], connections: [], level: 1 };
}

const camera = { x: 0, y: 0, k: 1 };

test("true overlaps prioritize directories, then readable files, then asteroids", () => {
  const directory = node("directory", "directory");
  const file = node("file", "file", "md");
  const asteroid = node("asteroid", "file", "other");
  const positions = new Map([
    [directory.id, { x: 40, y: 40, size: 14 }],
    [file.id, { x: 40, y: 40, size: 8 }],
    [asteroid.id, { x: 40, y: 40, size: 5 }],
  ]);

  assert.equal(pickPlanetNode([asteroid, file, directory], positions, camera, { x: 40, y: 40 }, "normal")?.id, directory.id);
  assert.equal(pickPlanetNode([asteroid, file], positions, camera, { x: 40, y: 40 }, "normal")?.id, file.id);
});

test("a direct orb hit beats another object's expanded assistance area", () => {
  const directory = node("directory", "directory");
  const file = node("file", "file", "pdf");
  const positions = new Map([
    [directory.id, { x: 50, y: 50, size: 10 }],
    [file.id, { x: 61, y: 50, size: 8 }],
  ]);

  assert.equal(pickPlanetNode([directory, file], positions, camera, { x: 61, y: 50 }, "normal")?.id, file.id);
});

test("hit assistance remains screen-sized across zoom and far zoom disables files", () => {
  const directory = node("directory", "directory");
  const file = node("file", "file", "md");
  const positions = new Map([
    [directory.id, { x: 100, y: 100, size: 12 }],
    [file.id, { x: 200, y: 100, size: 6 }],
  ]);
  const zoomedOut = { x: 0, y: 0, k: 0.5 };

  assert.equal(pickPlanetNode([directory], positions, zoomedOut, { x: 62, y: 50 }, "normal")?.id, directory.id);
  assert.equal(pickPlanetNode([file], positions, zoomedOut, { x: 100, y: 100 }, "far"), null);
});

test("same-type ties resolve by normalized distance and then stable id", () => {
  const left = node("a-file", "file", "md");
  const right = node("b-file", "file", "md");
  const positions = new Map([
    [left.id, { x: 10, y: 10, size: 6 }],
    [right.id, { x: 15, y: 10, size: 6 }],
  ]);

  assert.equal(pickPlanetNode([left, right], positions, camera, { x: 14, y: 10 }, "normal")?.id, right.id);
  positions.set(right.id, { x: 10, y: 10, size: 6 });
  assert.equal(pickPlanetNode([right, left], positions, camera, { x: 10, y: 10 }, "normal")?.id, left.id);
});
