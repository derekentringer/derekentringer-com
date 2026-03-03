import type { DTIResponse } from "@derekentringer/shared/finance";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";

interface DTIDetailDialogProps {
  data: DTIResponse;
  onClose: () => void;
}

function ratingColor(ratio: number): string {
  if (ratio > 43) return "text-destructive";
  if (ratio > 36) return "text-yellow-400";
  return "text-success";
}

function ratingLabel(ratio: number): string {
  if (ratio > 43) return "High";
  if (ratio > 36) return "Moderate";
  return "Good";
}

export function DTIDetailDialog({ data, onClose }: DTIDetailDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Debt-to-Income Ratio</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Summary */}
          <div className="flex items-baseline gap-2">
            <span className={cn("text-3xl font-bold", ratingColor(data.ratio))}>
              {data.ratio.toFixed(1)}%
            </span>
            <span className={cn("text-sm font-medium", ratingColor(data.ratio))}>
              {ratingLabel(data.ratio)}
            </span>
          </div>

          {/* Formula */}
          <div className="text-xs text-muted-foreground">
            {formatCurrency(data.monthlyDebtPayments)} debt / {formatCurrency(data.grossMonthlyIncome)} income
          </div>

          {/* Debt components */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-red-400">Monthly Debt Payments</h3>
              <span className="text-sm font-semibold text-red-400">
                {formatCurrency(data.monthlyDebtPayments)}
              </span>
            </div>
            {data.debtComponents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No debt payments found</p>
            ) : (
              <div className="space-y-1.5">
                {data.debtComponents.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {c.type === "loan" ? "Loan" : c.type === "credit" ? "Credit" : "Bill"}
                        {c.dtiPercentage != null && c.dtiPercentage !== 100 && ` (${c.dtiPercentage}%)`}
                      </span>
                    </div>
                    <span className="font-medium shrink-0 ml-3">{formatCurrency(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Income components */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-emerald-400">Gross Monthly Income</h3>
              <span className="text-sm font-semibold text-emerald-400">
                {formatCurrency(data.grossMonthlyIncome)}
              </span>
            </div>
            {data.incomeComponents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No income sources found</p>
            ) : (
              <div className="space-y-1.5">
                {data.incomeComponents.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {c.type === "manual" ? "Manual" : "Detected"}
                      </span>
                    </div>
                    <span className="font-medium shrink-0 ml-3">{formatCurrency(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Thresholds key */}
          <div className="border-t border-border pt-3 text-xs text-muted-foreground space-y-1">
            <div className="flex gap-3">
              <span className="text-success">Good: ≤ 36%</span>
              <span className="text-yellow-400">Moderate: 36–43%</span>
              <span className="text-destructive">High: &gt; 43%</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
