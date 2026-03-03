import { useState } from "react";
import type { DebtPayoffStrategyResult } from "@derekentringer/shared/finance";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/chartTheme";
import { ChevronDown, ChevronRight } from "lucide-react";

const DEFAULT_VISIBLE_MONTHS = 24;

interface DebtAmortizationTableProps {
  result: DebtPayoffStrategyResult;
}

export function DebtAmortizationTable({ result }: DebtAmortizationTableProps) {
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState<Set<string>>(new Set());

  function toggleAccount(accountId: string) {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  function toggleShowAll(accountId: string) {
    setShowAll((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  if (result.timelines.length === 0) {
    return <p className="text-sm text-muted-foreground">No debt accounts to display.</p>;
  }

  return (
    <div className="space-y-2">
      {result.timelines.map((timeline) => {
        const isExpanded = expandedAccounts.has(timeline.accountId);
        const isShowAll = showAll.has(timeline.accountId);
        const visibleSchedule = isShowAll
          ? timeline.schedule
          : timeline.schedule.slice(0, DEFAULT_VISIBLE_MONTHS);
        const hasMore = timeline.schedule.length > DEFAULT_VISIBLE_MONTHS;

        return (
          <div key={timeline.accountId} className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between p-3 hover:bg-accent transition-colors text-left"
              onClick={() => toggleAccount(timeline.accountId)}
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium text-sm">{timeline.name}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{timeline.monthsToPayoff} months</span>
                <span>Interest: {formatCurrency(timeline.totalInterestPaid)}</span>
                {timeline.payoffDate && <span>Payoff: {timeline.payoffDate}</span>}
              </div>
            </button>

            {isExpanded && (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Payment</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Principal</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Interest</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Extra</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSchedule.map((point) => (
                      <TableRow key={point.month}>
                        <TableCell className="text-xs">{point.month}</TableCell>
                        <TableCell className="text-right text-xs">{formatCurrency(point.payment)}</TableCell>
                        <TableCell className="text-right text-xs hidden sm:table-cell">{formatCurrency(point.principal)}</TableCell>
                        <TableCell className="text-right text-xs hidden sm:table-cell">{formatCurrency(point.interest)}</TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell">
                          {point.extraPayment > 0 ? formatCurrency(point.extraPayment) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-xs">{formatCurrency(point.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {hasMore && (
                  <div className="flex justify-center p-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleShowAll(timeline.accountId)}
                    >
                      {isShowAll ? "Show less" : `Show all ${timeline.schedule.length} months`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
