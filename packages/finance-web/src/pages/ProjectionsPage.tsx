import { useParams, useNavigate } from "react-router-dom";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import { NetIncomeTab } from "@/components/projections/NetIncomeTab.tsx";
import { SavingsTab } from "@/components/projections/SavingsTab.tsx";

type Tab = "net-income" | "savings";

const VALID_TABS: Tab[] = ["net-income", "savings"];

const TABS: { value: Tab; label: string }[] = [
  { value: "net-income", label: "Net Income" },
  { value: "savings", label: "Savings" },
];

export function ProjectionsPage() {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const tab: Tab = VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "net-income";

  function handleTabChange(value: Tab) {
    navigate(`/projections/${value}`, { replace: true });
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl md:text-3xl text-foreground">Projections</h1>
      </div>

      <TabSwitcher options={TABS} value={tab} onChange={handleTabChange} />

      {tab === "net-income" ? <NetIncomeTab /> : <SavingsTab />}
    </div>
  );
}
