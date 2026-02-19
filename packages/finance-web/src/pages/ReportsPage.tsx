import { BarChart3 } from "lucide-react";

export function ReportsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <BarChart3 className="h-16 w-16 text-muted-foreground" />
      <h1 className="font-thin text-3xl text-foreground">Reports</h1>
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  );
}
