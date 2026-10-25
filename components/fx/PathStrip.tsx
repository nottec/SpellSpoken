import { PALETTE, type NodeKind } from "./types";

export type PathStripProps = {
  /** run.map kinds: one array per floor. */
  floors: NodeKind[][];
  /** run.path: chosen node index per floor (shorter than floors while choosing). */
  path: number[];
  /** run.floor: the floor being chosen or played. */
  floor: number;
  className?: string;
};

const COL = 36, H = 48, GAP = 15;
const FAINT = "rgba(255,255,255,.12)", FUTURE = "rgba(185,173,153,.3)", FUTURE_BIG = "rgba(200,73,76,.45)";

function Mark({ kind, x, y, fill, stroke, big }: { kind: NodeKind; x: number; y: number; fill: string; stroke?: string; big: boolean }) {
  const common = { fill, stroke: stroke ?? "none", strokeWidth: 1.5 };
  const r = big ? (kind === "final" ? 7 : 6) : 3.5;
  switch (kind) {
    case "elite": return <path d={`M${x} ${y - 5} L${x + 5} ${y} L${x} ${y + 5} L${x - 5} ${y}Z`} {...common} />;
    case "rest": return <path d={`M${x} ${y - 4.5} L${x + 4.5} ${y + 3.5} L${x - 4.5} ${y + 3.5}Z`} {...common} />;
    case "event": return <path d={`M${x} ${y - 5} L${x + 1.6} ${y - 1.6} L${x + 5} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 5} L${x - 1.6} ${y + 1.6} L${x - 5} ${y} L${x - 1.6} ${y - 1.6}Z`} {...common} />;
    case "merchant": return <rect x={x - 3.5} y={y - 3.5} width="7" height="7" rx="1" {...common} />;
    case "final": return <><circle cx={x} cy={y} r={r + 3} fill="none" stroke={stroke ?? fill} strokeWidth="1" opacity=".6" /><circle cx={x} cy={y} r={r} {...common} /></>;
    default: return <circle cx={x} cy={y} r={r} {...common} />;
  }
}

/** Compact route strip: visited nodes moss, the current one ember, boss/final bigger, unchosen siblings faint. */
export default function PathStrip({ floors, path, floor, className = "" }: PathStripProps) {
  const W = floors.length * COL;
  const pos = (f: number, i: number, n: number) => ({ x: f * COL + COL / 2, y: H / 2 + (i - (n - 1) / 2) * GAP });
  const chosen = floors.map((fl, f) => (path[f] !== undefined && path[f] < fl.length ? pos(f, path[f], fl.length) : null));
  const choosing = path[floor] === undefined;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={`block overflow-visible ${className}`} role="img" aria-label={`floor ${floor + 1} of ${floors.length}`}>
      {chosen.map((a, f) => {
        const b = chosen[f + 1];
        if (!a || !b) return null;
        return <line key={f} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={f + 1 < floor ? PALETTE.moss : f + 1 === floor ? PALETTE.ember : FAINT} strokeWidth="1.5" strokeLinecap="round" opacity={f + 1 <= floor ? 0.8 : 1} />;
      })}
      {choosing && floor > 0 && chosen[floor - 1] && floors[floor]?.map((_, i) => {
        const a = chosen[floor - 1]!, b = pos(floor, i, floors[floor].length);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={PALETTE.ember} strokeOpacity=".5" strokeWidth="1.2" strokeDasharray="2 3" strokeLinecap="round" />;
      })}
      {floors.map((fl, f) =>
        fl.map((k, i) => {
          const { x, y } = pos(f, i, fl.length);
          const big = k === "boss" || k === "final";
          const isChosen = path[f] === i;
          let fill: string, stroke: string | undefined;
          if (f < floor) { fill = isChosen ? PALETTE.moss : FAINT; }
          else if (f === floor) {
            if (choosing) { fill = "rgba(240,163,94,.12)"; stroke = PALETTE.ember; }
            else { fill = isChosen ? PALETTE.ember : FAINT; }
          } else { fill = big ? FUTURE_BIG : FUTURE; }
          const current = f === floor && (isChosen || choosing);
          return (
            <g key={`${f}-${i}`} style={current && !choosing ? { filter: "drop-shadow(0 0 5px rgba(240,163,94,.8))" } : undefined}>
              <title>{`floor ${f + 1} · ${k}${f < floor && isChosen ? " · cleared" : f === floor && isChosen ? " · here" : ""}`}</title>
              <Mark kind={k} x={x} y={y} fill={fill} stroke={stroke} big={big} />
            </g>
          );
        }),
      )}
    </svg>
  );
}
