/** Seeded map generation. Pure: no DOM, no fetch. */
import { enemies } from "@/data/enemies";
import { events } from "@/data/events";

export type NodeKind = "fight" | "elite" | "rest" | "event" | "merchant" | "boss" | "final";
export type MapNode = { kind: NodeKind; enemyId?: string; eventId?: string };

export const FLOORS = 8;
/** Floors that offer 2–3 doors; 0 is a single fight, 3 the boss, 7 the final. */
export const OPEN_FLOORS = [1, 2, 4, 5, 6];
export const BOSS_FLOOR = 3;
export const FINAL_FLOOR = FLOORS - 1;

const COMBAT: ReadonlySet<NodeKind> = new Set<NodeKind>(["fight", "elite", "boss", "final"]);
export const isCombat = (k: NodeKind) => COMBAT.has(k);

function shuffle<T>(r: () => number, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Constraints (see docs/DESIGN.md §4): per open floor 2–3 doors, at most one elite,
 * at least one fight-or-elite; rest on exactly two of the five open floors, merchant on
 * exactly two, event on at least two. Enemy ids never repeat within a run.
 */
export function generateMap(r: () => number): MapNode[][] {
  const restFloors = shuffle(r, OPEN_FLOORS).slice(0, 2);
  const merchantFloors = shuffle(r, OPEN_FLOORS).slice(0, 2);
  const eliteCount = 2 + Math.floor(r() * 3);                       // 2–4 elite doors (4 elite ids exist)
  const eliteFloors = shuffle(r, OPEN_FLOORS.filter((f) => f !== 1)).slice(0, eliteCount);   // never on floor 1: a tier-1 deck needs a fight first

  const doors: NodeKind[][] = OPEN_FLOORS.map((f) => {
    const d: NodeKind[] = [eliteFloors.includes(f) ? "elite" : "fight"];
    if (restFloors.includes(f)) d.push("rest");
    if (merchantFloors.includes(f)) d.push("merchant");
    if (d.length < 2 || (d.length === 2 && r() < 0.55)) d.push("event");
    else if (d.length === 2 && d[0] === "elite" && r() < 0.5) d.push("fight");   // a safer road past an elite
    return d;
  });
  // event on at least two floors
  for (const i of shuffle(r, doors.map((_, i) => i))) {
    if (doors.filter((d) => d.includes("event")).length >= 2) break;
    if (!doors[i].includes("event") && doors[i].length < 3) doors[i].push("event");
  }

  const minions = shuffle(r, enemies.filter((e) => e.kind === "minion").map((e) => e.id));
  const elites = shuffle(r, enemies.filter((e) => e.kind === "elite").map((e) => e.id));
  const bosses = shuffle(r, enemies.filter((e) => e.kind === "boss").map((e) => e.id));
  const finals = enemies.filter((e) => e.kind === "final").map((e) => e.id);
  const eventIds = shuffle(r, events.map((e) => e.id));
  let ev = 0;
  const node = (kind: NodeKind): MapNode => {
    if (kind === "fight") return { kind, enemyId: minions.shift() };
    if (kind === "elite") return { kind, enemyId: elites.shift() };
    if (kind === "boss") return { kind, enemyId: bosses.shift() };
    if (kind === "final") return { kind, enemyId: finals[0] };
    if (kind === "event") return { kind, eventId: eventIds[ev++ % eventIds.length] };
    return { kind };
  };

  const map: MapNode[][] = [];
  map[0] = [node("fight")];
  OPEN_FLOORS.forEach((f, i) => { map[f] = shuffle(r, doors[i]).map(node); });
  map[BOSS_FLOOR] = [node("boss")];
  map[FINAL_FLOOR] = [node("final")];
  return map;
}
