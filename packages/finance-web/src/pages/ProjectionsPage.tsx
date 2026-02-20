import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NetIncomeTab } from "@/components/projections/NetIncomeTab.tsx";
import { SavingsTab } from "@/components/projections/SavingsTab.tsx";

type Tab = "net-income" | "savings";

export function ProjectionsPage() {
  const [tab, setTab] = useState<Tab>("net-income");

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl text-foreground">Projections</h1>
      </div>

      <div className="flex gap-2">
        <Button
          variant={tab === "net-income" ? "default" : "outline"}
          onClick={() => setTab("net-income")}
        >
          Net Income
        </Button>
        <Button
          variant={tab === "savings" ? "default" : "outline"}
          onClick={() => setTab("savings")}
        >
          Savings
        </Button>
      </div>

      {tab === "net-income" ? <NetIncomeTab /> : <SavingsTab />}
    </div>
  );
}
