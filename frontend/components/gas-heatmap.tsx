"use client";

import { CalendarClock, DatabaseZap, TriangleAlert } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState, type MouseEvent } from "react";

import {
  buildHeatmapGrid,
  heatmapColor,
  heatmapGradient,
  heatmapIntensity,
  type GasExtreme,
  type GasHeatmapCell,
  type HeatmapCell,
  type HeatmapGrid,
} from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { formatCount, formatGasPrice, parseDecimalString } from "@/lib/format";

import { GlassCard, SectionHeading } from "./ui/glass-card";
import { Notice } from "./ui/notice";
import { Skeleton } from "./ui/skeleton";

/** Tooltip geometry, used to keep the bubble inside the scroll container. */
const TOOLTIP_HALF_WIDTH = 92;
const TOOLTIP_HEIGHT = 78;
const TOOLTIP_OFFSET = 8;

/** Spoken description of a bucket, since the cells themselves are colour only. */
function describeCell(cell: HeatmapCell): string {
  if (cell.avgGwei === null) return `${cell.label}: no samples`;
  return `${cell.label}: ${cell.avgGwei} Gwei average, ${cell.sampleCount} samples`;
}

interface HeatmapTableProps {
  grid: HeatmapGrid;
  onHover: (event: MouseEvent<HTMLTableCellElement>, cell: HeatmapCell) => void;
  onLeave: () => void;
}

/**
 * The 7x24 matrix. Memoised so that hovering a cell — which lives in the
 * parent's state — repaints only the tooltip, never all 168 squares.
 */
const HeatmapTable = memo(function HeatmapTable({ grid, onHover, onLeave }: HeatmapTableProps) {
  return (
    <table className="w-full min-w-[42rem] table-fixed border-separate border-spacing-[3px]">
      <caption className="sr-only">
        Average gas price in Gwei by UTC day of week and hour of day.
      </caption>

      <thead>
        <tr>
          <th scope="col" className="w-10" />
          {grid.hours.map((hour) => (
            <th
              key={hour}
              scope="col"
              className="num pb-1 text-center text-[0.6rem] font-normal text-slate-500"
            >
              {String(hour).padStart(2, "0")}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {grid.rows.map((row) => (
          <tr key={row.dayOfWeek}>
            <th
              scope="row"
              className="num pr-1 text-right text-[0.68rem] font-normal text-slate-500"
            >
              {row.shortName}
            </th>

            {row.cells.map((cell) => {
              const intensity = heatmapIntensity(cell.avgGwei, grid.minGwei, grid.maxGwei);

              return (
                <td
                  key={cell.hourOfDay}
                  onMouseEnter={(event) => onHover(event, cell)}
                  onMouseLeave={onLeave}
                  className="p-0"
                >
                  <div
                    aria-hidden
                    style={
                      intensity === null ? undefined : { backgroundColor: heatmapColor(intensity) }
                    }
                    className={cn(
                      "h-6 w-full rounded-[4px] ring-1 ring-inset transition duration-150 ease-out-expo",
                      intensity === null
                        ? "bg-slate-800/40 ring-slate-800"
                        : "ring-white/[0.06] hover:ring-cyan-300/70",
                    )}
                  />
                  <span className="sr-only">{describeCell(cell)}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
});

interface HoverState {
  cell: HeatmapCell;
  /** Anchor in the scroll container's content space. */
  left: number;
  top: number;
  placement: "above" | "below";
}

function ExtremeTile({
  label,
  extreme,
  accent,
}: {
  label: string;
  extreme: GasExtreme | null;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2">
      <p className="text-[0.62rem] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={cn("num mt-1 truncate text-sm font-medium", extreme ? accent : "text-slate-500")}>
        {extreme ? extreme.label : "—"}
      </p>
      <p className="num mt-0.5 text-[0.62rem] text-slate-500">
        {extreme
          ? `${formatGasPrice(parseDecimalString(extreme.avgGasPriceGwei))} Gwei avg`
          : "no samples"}
      </p>
    </div>
  );
}

interface GasHeatmapProps {
  cells: GasHeatmapCell[];
  extremes: { cheapest: GasExtreme | null; priciest: GasExtreme | null };
  loading: boolean;
  configured: boolean | null;
  error: string | null;
}

/**
 * When the network is cheapest to transact: average gas price bucketed by UTC
 * day of week and hour of day, shaded green (cheap) through to red (dear).
 */
export function GasHeatmap({ cells, extremes, loading, configured, error }: GasHeatmapProps) {
  const grid = useMemo(() => buildHeatmapGrid(cells), [cells]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const handleHover = useCallback(
    (event: MouseEvent<HTMLTableCellElement>, cell: HeatmapCell) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const cellRect = event.currentTarget.getBoundingClientRect();
      const baseRect = wrapper.getBoundingClientRect();

      // The bubble is a sibling of the scroller, not a child of it, so these
      // are plain viewport-relative offsets — no scroll compensation, and no
      // risk of the bubble extending the grid's scrollable area.
      const maxLeft = Math.max(TOOLTIP_HALF_WIDTH, baseRect.width - TOOLTIP_HALF_WIDTH);
      const left = Math.min(
        Math.max(cellRect.left - baseRect.left + cellRect.width / 2, TOOLTIP_HALF_WIDTH),
        maxLeft,
      );

      // Above the cell by preference; below it for the top row, where there is
      // no headroom before the grid starts.
      const needed = TOOLTIP_HEIGHT + TOOLTIP_OFFSET;
      const roomAbove = cellRect.top - baseRect.top >= needed;
      const roomBelow = baseRect.height - (cellRect.bottom - baseRect.top) >= needed;
      const placement: HoverState["placement"] = roomAbove || !roomBelow ? "above" : "below";
      const anchor =
        (placement === "above" ? cellRect.top - TOOLTIP_OFFSET : cellRect.bottom + TOOLTIP_OFFSET) -
        baseRect.top;

      setHover({ cell, left, top: anchor, placement });
    },
    [],
  );

  const clearHover = useCallback(() => setHover(null), []);

  const bucketCount = grid.rows.length * grid.hours.length;
  const hasData = grid.populatedBuckets > 0;
  const hoverIntensity = hover
    ? heatmapIntensity(hover.cell.avgGwei, grid.minGwei, grid.maxGwei)
    : null;

  return (
    <GlassCard className="p-5">
      <SectionHeading
        title="Gas Heatmap"
        subtitle="Average gas price per UTC hour · the cheapest windows to transact"
        icon={<CalendarClock className="h-4 w-4" />}
        action={
          <span className="num rounded-full border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[0.68rem] text-slate-500">
            {grid.populatedBuckets}/{bucketCount} buckets
          </span>
        }
      />

      {loading ? (
        <Skeleton className="mt-4 h-64 w-full rounded-xl" />
      ) : error ? (
        <Notice
          className="mt-4"
          tone="rose"
          icon={<TriangleAlert className="h-4 w-4" />}
          title="Gas history unavailable"
          detail={error}
        />
      ) : configured === false ? (
        <Notice
          className="mt-4"
          tone="slate"
          icon={<DatabaseZap className="h-4 w-4" />}
          title="History is not connected"
          detail="The heatmap is built from logged pulse samples. Set the Supabase credentials and run supabase/schema.sql plus supabase/02_analytics_views.sql."
        />
      ) : !hasData ? (
        <Notice
          className="mt-4"
          tone="slate"
          icon={<DatabaseZap className="h-4 w-4" />}
          title="No gas samples recorded yet"
          detail="The views are live but every bucket is empty. The grid fills in as the worker logs cycles."
        />
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <ExtremeTile
              label="Cheapest window"
              extreme={extremes.cheapest}
              accent="text-status-healthy"
            />
            <ExtremeTile
              label="Priciest window"
              extreme={extremes.priciest}
              accent="text-status-offline"
            />
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2">
              <p className="text-[0.62rem] uppercase tracking-[0.14em] text-slate-500">Coverage</p>
              <p className="num mt-1 text-sm font-medium text-slate-200">
                {formatCount(grid.samples)} samples
              </p>
              <p className="num mt-0.5 text-[0.62rem] text-slate-500">
                min {formatGasPrice(grid.minGwei)} · max {formatGasPrice(grid.maxGwei)} Gwei
              </p>
            </div>
          </div>

          <div ref={wrapperRef} className="relative mt-4">
            {/* Scrolling the grid invalidates the bubble's anchor, so drop it. */}
            <div className="overflow-x-auto pb-1" onScroll={clearHover}>
              <HeatmapTable grid={grid} onHover={handleHover} onLeave={clearHover} />
            </div>

            {hover ? (
              <div
                aria-hidden
                className="pointer-events-none absolute z-20 w-[11.5rem] rounded-lg border border-slate-700/80 bg-slate-950/95 px-3 py-2 shadow-xl backdrop-blur"
                style={{
                  left: hover.left,
                  top: hover.top,
                  transform: `translate(-50%, ${hover.placement === "above" ? "-100%" : "0"})`,
                }}
              >
                <p className="num text-[0.68rem] text-slate-400">{hover.cell.label}</p>

                {hover.cell.avgGwei === null ? (
                  <p className="num mt-1 text-sm text-slate-500">no samples</p>
                ) : (
                  <>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                        style={{
                          backgroundColor:
                            hoverIntensity === null ? undefined : heatmapColor(hoverIntensity),
                        }}
                      />
                      <p className="num text-sm font-semibold text-cyan-300">
                        {formatGasPrice(hover.cell.avgGwei)}
                        <span className="ml-1 text-[0.66rem] font-normal text-slate-500">
                          Gwei avg
                        </span>
                      </p>
                    </div>
                    <p className="num mt-1 text-[0.62rem] text-slate-500">
                      {formatCount(hover.cell.sampleCount)} samples · {formatGasPrice(hover.cell.minGwei)}
                      –{formatGasPrice(hover.cell.maxGwei)}
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </div>

          <footer className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[0.68rem] text-slate-600">cheap</span>
              <span
                className="h-2 w-28 rounded-full ring-1 ring-inset ring-white/[0.06]"
                style={{ backgroundImage: heatmapGradient() }}
              />
              <span className="text-[0.68rem] text-slate-600">expensive</span>
            </div>
            <p className="num text-[0.68rem] text-slate-600">
              hours and days are UTC · hover a square for exact averages
            </p>
          </footer>
        </>
      )}
    </GlassCard>
  );
}
