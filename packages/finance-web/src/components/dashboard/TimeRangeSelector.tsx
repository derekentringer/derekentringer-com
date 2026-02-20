import type { ChartTimeRange, ChartGranularity } from "@derekentringer/shared/finance";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS: { value: ChartTimeRange; label: string }[] = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "All" },
];

const GRANULARITY_OPTIONS: { value: ChartGranularity; label: string }[] = [
  { value: "weekly", label: "W" },
  { value: "monthly", label: "M" },
];

interface TimeRangeSelectorProps {
  range: ChartTimeRange;
  granularity: ChartGranularity;
  onRangeChange: (range: ChartTimeRange) => void;
  onGranularityChange: (granularity: ChartGranularity) => void;
}

export function TimeRangeSelector({
  range,
  granularity,
  onRangeChange,
  onGranularityChange,
}: TimeRangeSelectorProps) {
  const pillBase =
    "px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer select-none";
  const pillActive = "bg-foreground/15 text-foreground";
  const pillInactive = "text-muted-foreground hover:text-foreground hover:bg-foreground/5";

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center rounded-md border border-border overflow-hidden">
        {GRANULARITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onGranularityChange(opt.value)}
            className={cn(pillBase, opt.value === granularity ? pillActive : pillInactive)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex items-center rounded-md border border-border overflow-hidden">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onRangeChange(opt.value)}
            className={cn(pillBase, opt.value === range ? pillActive : pillInactive)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
