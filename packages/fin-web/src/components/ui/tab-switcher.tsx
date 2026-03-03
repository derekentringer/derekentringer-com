import { cn } from "@/lib/utils";

interface TabOption<T extends string> {
  value: T;
  label: string;
}

interface TabSwitcherProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "default";
  className?: string;
}

export function TabSwitcher<T extends string>({
  options,
  value,
  onChange,
  size = "default",
  className,
}: TabSwitcherProps<T>) {
  return (
    <div
      className={cn(
        "flex w-fit items-center rounded-md border border-border overflow-hidden",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "font-medium rounded transition-colors cursor-pointer select-none",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-1.5 text-sm",
            value === opt.value
              ? "bg-foreground/15 text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
