/* Fundo topográfico do design system — curvas de nível geradas, determinísticas. */

interface Center {
  cx: number;
  cy: number;
  rings: number;
  gap: number;
  sx: number;
  sy: number;
  seed: number;
}

const CENTERS: readonly Center[] = [
  { cx: 260, cy: 250, rings: 9, gap: 46, sx: 1.3, sy: 0.78, seed: 0.0 },
  { cx: 880, cy: 640, rings: 8, gap: 52, sx: 1.15, sy: 0.86, seed: 1.7 },
  { cx: 640, cy: 120, rings: 6, gap: 58, sx: 1.45, sy: 0.7, seed: 3.1 },
];

function contour(cx: number, cy: number, r: number, seed: number, k: number): string {
  const N = 44;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const w =
      1 +
      0.17 * Math.sin(3 * a + seed) +
      0.11 * Math.sin(5 * a - seed * 1.3) +
      0.06 * Math.sin(7 * a + k * 0.55);
    pts.push([cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w]);
  }
  const p = (i: number): [number, number] => pts[((i % N) + N) % N]!;
  let d = `M${p(0)[0].toFixed(1)},${p(0)[1].toFixed(1)}`;
  for (let i = 0; i < N; i += 1) {
    const [x0, y0] = p(i - 1);
    const [x1, y1] = p(i);
    const [x2, y2] = p(i + 1);
    const [x3, y3] = p(i + 2);
    d +=
      `C${(x1 + (x2 - x0) / 6).toFixed(1)},${(y1 + (y2 - y0) / 6).toFixed(1)}` +
      ` ${(x2 - (x3 - x1) / 6).toFixed(1)},${(y2 - (y3 - y1) / 6).toFixed(1)}` +
      ` ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return `${d}Z`;
}

export function TopoBackground(): React.JSX.Element {
  return (
    <div aria-hidden className="topo">
      <svg viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice">
        {CENTERS.flatMap(({ cx, cy, rings, gap, sx, sy, seed }) =>
          Array.from({ length: rings }, (_, k) => (
            <path
              key={`${cx}-${k}`}
              d={contour(cx, cy, (k + 1) * gap, seed, k)}
              transform={`translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`}
              className={k % 3 === 2 ? 'topo-index' : undefined}
            />
          )),
        )}
      </svg>
    </div>
  );
}
