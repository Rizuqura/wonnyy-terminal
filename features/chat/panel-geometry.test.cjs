const test = require("node:test");
const assert = require("node:assert/strict");
const { resizeGeometry, clampGeometry } = require("./panel-geometry.ts");
for (const direction of ["n", "s", "w", "e", "nw", "ne", "sw", "se"])
  test(
    "resize " + direction + " preserves opposite edges and clamps viewport",
    () => {
      const original = { x: 100, y: 100, width: 440, height: 440 };
      const next = resizeGeometry(original, direction, 30, 30, 1000, 900);
      if (direction.includes("w")) assert.equal(next.x + next.width, 540);
      if (direction.includes("n")) assert.equal(next.y + next.height, 540);
      if (direction.includes("e")) assert.equal(next.x, 100);
      if (direction.includes("s")) assert.equal(next.y, 100);
      assert.notDeepEqual(next, original);
      const bounded = resizeGeometry(
        original,
        direction,
        5000,
        5000,
        1000,
        900,
      );
      assert.ok(
        bounded.x >= 0 &&
          bounded.y >= 0 &&
          bounded.x + bounded.width <= 1000 &&
          bounded.y + bounded.height <= 900,
      );
      assert.ok(bounded.width >= 360 && bounded.height >= 360);
    },
  );
test("small viewports and restored offscreen geometry stay accessible", () => {
  assert.deepEqual(
    clampGeometry({ x: 2000, y: -300, width: 500, height: 700 }, 300, 240),
    { x: 0, y: 0, width: 300, height: 240 },
  );
});
