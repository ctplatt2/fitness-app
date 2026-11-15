import { BarController, BarElement, CategoryScale, Chart, LineController, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import { useEffect, useRef } from 'preact/hooks';

Chart.register(LineController, LineElement, PointElement, BarController, BarElement, LinearScale, CategoryScale, Tooltip);

// Validated against the card surface (#1e293b) for contrast and colour-blind separation.
export const CHART_BLUE = '#0284c7';
export const CHART_GREEN = '#16a34a';
const INK = '#94a3b8';
const GRID = 'rgba(148, 163, 184, 0.16)';

/** A single-series line or bar chart. The title above it names the series, so there is no legend. */
export function SeriesChart(props: {
  kind: 'line' | 'bar';
  labels: string[];
  values: number[];
  color?: string;
  /** Formats axis ticks and tooltip values. */
  format?: (v: number) => string;
  /** Start the y axis at zero (bars always do). */
  zero?: boolean;
  /** Smaller is better (pace): flip the axis so "up" still means improvement. */
  reverse?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify([props.kind, props.labels, props.values, props.color, props.zero, props.reverse]);

  useEffect(() => {
    if (!ref.current) return;
    const color = props.color ?? CHART_BLUE;
    const fmt = props.format ?? ((v: number) => String(Math.round(v * 10) / 10));
    const chart = new Chart(ref.current, {
      type: props.kind,
      data: {
        labels: props.labels,
        datasets: [
          props.kind === 'line'
            ? { data: props.values, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: '#1e293b', pointBorderWidth: 2, tension: 0.25 }
            : { data: props.values, backgroundColor: color, borderRadius: 4, maxBarThickness: 28 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: { label: (ctx) => `${props.label}: ${fmt(ctx.parsed.y ?? 0)}` },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { color: GRID }, ticks: { color: INK, maxRotation: 0, autoSkipPadding: 12, font: { size: 11 } } },
          y: {
            beginAtZero: props.kind === 'bar' || props.zero,
            reverse: props.reverse,
            grace: '8%',
            grid: { color: GRID },
            border: { display: false },
            ticks: { color: INK, maxTicksLimit: 5, font: { size: 11 }, callback: (v) => fmt(Number(v)) },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [key]);

  return (
    <div class="chart" role="img" aria-label={`${props.label} chart`}>
      <canvas ref={ref} />
    </div>
  );
}
