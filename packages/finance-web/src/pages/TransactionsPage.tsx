import { ArrowLeftRight } from "lucide-react";

export function TransactionsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <ArrowLeftRight className="h-16 w-16 text-muted-foreground" />
      <h1 className="font-thin text-3xl">Transactions</h1>
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  );
}
