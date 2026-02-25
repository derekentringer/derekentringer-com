import type { RebalanceResponse } from "@derekentringer/shared/finance";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyFull } from "@/lib/chartTheme";

interface RebalanceCardProps {
  data: RebalanceResponse;
}

export function RebalanceCard({ data }: RebalanceCardProps) {
  if (data.suggestions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-xl text-foreground">Rebalancing</h2>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Set target allocations to see rebalancing suggestions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl text-foreground">Rebalancing Suggestions</h2>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Class</TableHead>
                <TableHead className="text-right">Current %</TableHead>
                <TableHead className="text-right">Target %</TableHead>
                <TableHead className="text-right">Drift</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.suggestions.map((s) => {
                const absDrift = Math.abs(s.drift);
                const driftColor = absDrift < 1
                  ? "text-green-400"
                  : absDrift < 5
                    ? "text-yellow-400"
                    : "text-red-400";

                return (
                  <TableRow key={s.assetClass}>
                    <TableCell className="font-medium">{s.label}</TableCell>
                    <TableCell className="text-right">{s.currentPct.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{s.targetPct.toFixed(1)}%</TableCell>
                    <TableCell className={cn("text-right font-medium", driftColor)}>
                      {s.drift > 0 ? "+" : ""}{s.drift.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        s.action === "buy" && "bg-green-500/10 text-green-400",
                        s.action === "sell" && "bg-red-500/10 text-red-400",
                        s.action === "hold" && "bg-white/10 text-foreground/70",
                      )}>
                        {s.action === "buy" ? "Buy" : s.action === "sell" ? "Sell" : "Hold"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.amount > 0 ? formatCurrencyFull(s.amount) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
