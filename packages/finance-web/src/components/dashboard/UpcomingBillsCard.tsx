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
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function UpcomingBillsCard({ data }: UpcomingBillsCardProps) {
  if (data.bills.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-xl text-foreground">Upcoming Bills</h2>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No upcoming bills.{" "}
            <Link to="/bills" className="text-primary hover:underline">
              Add a bill
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show at most 8 bills on dashboard
  const displayBills = data.bills.slice(0, 8);

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
          {displayBills.map((bill, i) => (
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

        {data.overdueCount > 0 && (
          <p className="text-xs text-destructive mt-3">
            {data.overdueCount} overdue bill{data.overdueCount > 1 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
