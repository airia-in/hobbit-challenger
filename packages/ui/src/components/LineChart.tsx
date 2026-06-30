import { useId, useMemo } from 'react';
import { cn } from '../utils/cn';

export type LineChartPoint =
  | { x: number; y: number }
  | { date: string; value: number };

export type LineChartSeries = {
  label: string;
  points: LineChartPoint[];
  color?: string;
};

export type LineChartProps = {
  series: LineChartSeries[];
  width?: number;
  height?: number;
  emptyMessage?: string;
  className?: string;
  valueLabel?: string;
};

const DEFAULT_COLORS = [
  'var(--accent-red)',
  'var(--gold)',
  'var(--success)',
  'var(--text-muted)',
];

const PADDING = { top: 16, right: 12, bottom: 28, left: 40 };

function normalizePoint(
  point: LineChartPoint,
  index: number,
): { x: number; y: number; label: string } {
  if ('date' in point) {
    return { x: index, y: point.value, label: point.date };
  }
  return { x: point.x, y: point.y, label: String(point.x) };
}

export function LineChart({
  series,
  width = 480,
  height = 220,
  emptyMessage = 'Not enough data yet',
  className,
  valueLabel = 'Value',
}: LineChartProps) {
  const gradientId = useId();
  const hasData = series.some((entry) => entry.points.length > 0);

  const plot = useMemo(() => {
    const normalized = series.map((entry) => ({
      ...entry,
      points: entry.points.map((point, index) => normalizePoint(point, index)),
    }));

    const allY = normalized.flatMap((entry) =>
      entry.points.map((point) => point.y),
    );
    const minY = allY.length > 0 ? Math.min(0, ...allY) : 0;
    const maxY = allY.length > 0 ? Math.max(1, ...allY) : 1;
    const maxX = Math.max(
      1,
      ...normalized.map((entry) => Math.max(0, entry.points.length - 1)),
    );

    const innerW = width - PADDING.left - PADDING.right;
    const innerH = height - PADDING.top - PADDING.bottom;

    const xAt = (index: number) =>
      PADDING.left + (index / Math.max(maxX, 1)) * innerW;
    const yAt = (value: number) =>
      PADDING.top + innerH - ((value - minY) / (maxY - minY || 1)) * innerH;

    return { normalized, minY, maxY, xAt, yAt, innerW, innerH };
  }, [series, width, height]);

  if (!hasData) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-8 text-sm text-[var(--text-muted)]',
          className,
        )}
        style={{ minHeight: height }}
      >
        {emptyMessage}
      </div>
    );
  }

  const yTicks = [plot.minY, plot.maxY];
  const xLabels = plot.normalized[0]?.points ?? [];

  return (
    <div className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Line chart"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--accent-red)"
              stopOpacity="0.25"
            />
            <stop offset="100%" stopColor="var(--accent-red)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={plot.yAt(tick)}
              y2={plot.yAt(tick)}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <text
              x={PADDING.left - 6}
              y={plot.yAt(tick) + 4}
              textAnchor="end"
              className="fill-[var(--text-muted)] text-[10px]"
            >
              {Math.round(tick)}
            </text>
          </g>
        ))}

        {plot.normalized.map((entry, seriesIndex) => {
          const color =
            entry.color ?? DEFAULT_COLORS[seriesIndex % DEFAULT_COLORS.length];
          if (entry.points.length === 0) return null;

          const path = entry.points
            .map((point, index) => {
              const cmd = index === 0 ? 'M' : 'L';
              return `${cmd} ${plot.xAt(point.x)} ${plot.yAt(point.y)}`;
            })
            .join(' ');

          const areaPath =
            entry.points.length > 0
              ? `${path} L ${plot.xAt(entry.points[entry.points.length - 1]!.x)} ${plot.yAt(plot.minY)} L ${plot.xAt(entry.points[0]!.x)} ${plot.yAt(plot.minY)} Z`
              : '';

          return (
            <g key={entry.label}>
              {seriesIndex === 0 && areaPath ? (
                <path d={areaPath} fill={`url(#${gradientId})`} />
              ) : null}
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {entry.points.map((point) => (
                <circle
                  key={`${entry.label}-${point.label}`}
                  cx={plot.xAt(point.x)}
                  cy={plot.yAt(point.y)}
                  r={3}
                  fill={color}
                />
              ))}
            </g>
          );
        })}

        {xLabels.map((point, index) => {
          if (
            xLabels.length > 8 &&
            index % Math.ceil(xLabels.length / 6) !== 0
          ) {
            return null;
          }
          const label =
            point.label.length > 10
              ? point.label.slice(5)
              : point.label.slice(5);
          return (
            <text
              key={point.label}
              x={plot.xAt(point.x)}
              y={height - 8}
              textAnchor="middle"
              className="fill-[var(--text-muted)] text-[9px]"
            >
              {label}
            </text>
          );
        })}

        <text
          x={8}
          y={PADDING.top + plot.innerH / 2}
          transform={`rotate(-90 8 ${PADDING.top + plot.innerH / 2})`}
          textAnchor="middle"
          className="fill-[var(--text-muted)] text-[10px]"
        >
          {valueLabel}
        </text>
      </svg>

      <div className="mt-2 flex flex-wrap gap-3">
        {plot.normalized.map((entry, index) => (
          <div
            key={entry.label}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  entry.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
              }}
            />
            {entry.label}
          </div>
        ))}
      </div>
    </div>
  );
}
