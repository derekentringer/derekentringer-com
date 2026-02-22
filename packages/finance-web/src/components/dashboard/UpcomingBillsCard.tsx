import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { DashboardUpcomingBillsResponse } from "@derekentringer/shared/finance";
import { formatCurrencyFull } from "@/lib/chartTheme";

interface UpcomingBillsCardProps {
  data: DashboardUpcomingBillsResponse;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function UpcomingBillsCard({ data }: UpcomingBillsCardProps) {
  // Filter to bills due from today through end of current month
  const { bills, overdueCount } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const filtered = data.bills.filter((b) => {
      if (b.isPaid) return false;
      const due = new Date(b.dueDate + "T00:00:00");
      return due >= today && due <= endOfMonth;
    });
    const overdue = filtered.filter((b) => b.isOverdue).length;
    return { bills: filtered, overdueCount: overdue };
  }, [data.bills]);

  if (bills.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-xl text-foreground">Upcoming Bills</h2>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No upcoming bills this month.{" "}
            <Link to="/bills" className="text-primary hover:underline">
              View all bills
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-foreground">Upcoming Bills</h2>
          <Link
            to="/bills"
            className="text-xs text-primary hover:underline"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div>
          {bills.map((bill, i) => (
            <div
              key={`${bill.billId}-${bill.dueDate}-${i}`}
              className={cn(
                "flex items-center justify-between text-sm px-2 py-0.5 rounded",
                i % 2 === 0 && "bg-white/[0.03]",
              )}
            >
              <div className="flex items-center gap-2 truncate mr-2">
                <span className="truncate">{bill.billName}</span>
                {bill.isOverdue && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    Overdue
                  </Badge>
                )}
                {bill.isPaid && (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">
                    Paid
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 whitespace-nowrap">
                <span className="text-muted-foreground text-xs">
                  {formatDate(bill.dueDate)}
                </span>
                <span>{formatCurrencyFull(bill.amount)}</span>
              </div>
            </div>
          ))}
        </div>

        {overdueCount > 0 && (
          <p className="text-xs text-destructive mt-3">
            {overdueCount} overdue bill{overdueCount > 1 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
