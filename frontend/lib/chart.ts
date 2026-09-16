export const CAT_COLORS = ["#9eb39e", "#c6a566", "#8197ab", "#ae8c98", "#7ab3a8", "#c9b89e"];

export type ChartRow = { occurred_on: string; amount: number };

export function buildChart(rows: ChartRow[], dates: string[]) {
  const byDate: Record<string, number> = {};
  for (const r of rows) byDate[r.occurred_on] = (byDate[r.occurred_on] || 0) + r.amount;

  const vals = dates.map((d) => byDate[d] || 0);
  const max = Math.max(...vals, 1);
  const W = 700;
  const H = 170;
  const days = dates.length;
  const pts = vals.map((v, i) => ({
    x: (i / Math.max(days - 1, 1)) * W,
    y: H - (v / max) * (H - 24) - 4,
  }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const hasData = vals.some((v) => v > 0);
  const labelIdxs = [0, Math.floor(days / 4), Math.floor(days / 2), Math.floor((days * 3) / 4), days - 1];
  const labels = labelIdxs.map((i) =>
    new Date(dates[i] + "T12:00").toLocaleDateString("en-ZM", { day: "numeric", month: "short" })
  );
  return { line, area, hasData, labels };
}
