import type { ContextBox } from "../types/ai";
import type { Station, StationAssignment } from "../types/electron";

// Context Boxes participate in the existing Station projection without creating
// a second persisted collection or granting any execution capabilities.
export function contextBoxStations(
  stations: Station[],
  assignments: StationAssignment[],
  boxes: ContextBox[],
  activeStations: ReadonlySet<string>,
  activeBoxes: ReadonlySet<string>,
  knownPaths: ReadonlySet<string>,
) {
  const boxStationId = (id: string) => `context-box:${id}`;
  const merged = new Map(
    assignments.map((item) => [
      item.relativePath,
      { ...item, stationIds: [...item.stationIds] },
    ]),
  );
  for (const box of boxes)
    for (const item of box.items) {
      const existing = merged.get(item.relativePath);
      if (existing) existing.stationIds.push(boxStationId(box.id));
      else
        merged.set(item.relativePath, {
          relativePath: item.relativePath,
          kind: "file",
          stationIds: [boxStationId(box.id)],
          missing: !knownPaths.has(item.relativePath),
        });
    }
  return {
    stations: [
      ...stations,
      ...boxes.map((box) => ({
        id: boxStationId(box.id),
        name: box.name,
        createdAt: box.createdAt,
        updatedAt: box.updatedAt,
        assignmentCount: box.items.length,
      })),
    ],
    assignments: [...merged.values()],
    activeIds: new Set([
      ...activeStations,
      ...boxes
        .filter((box) => activeBoxes.has(box.id))
        .map((box) => boxStationId(box.id)),
    ]),
  };
}
