import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { Transaction } from "@derekentringer/shared/finance";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { fetchTransactions } from "../../api/transactions.ts";

interface RecentTransactionsCardProps {
  accountId: string;
  className?: string;
}

export function RecentTransactionsCard({ accountId, className }: RecentTransactionsCardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTransactions({ accountId, limit: 5 })
      .then(({ transactions: txns }) => {
        if (!cancelled) setTransactions(txns);
      })
      .catch(() => {
        // silently fail
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [accountId]);

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <h3 className="text-sm font-medium text-foreground">Recent Transactions</h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <>
            {transactions.map((txn) => (
              <div key={txn.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{txn.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(txn.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-medium ${txn.amount > 0 ? "text-success" : txn.amount < 0 ? "text-destructive" : "text-foreground"}`}>
                    {formatCurrencyFull(txn.amount)}
                  </p>
                  {txn.category && (
                    <p className="text-xs text-muted-foreground">{txn.category}</p>
                  )}
                </div>
              </div>
            ))}
            <Link
              to={`/transactions?accountId=${accountId}`}
              className="text-sm text-primary hover:underline mt-auto"
            >
              View All
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
