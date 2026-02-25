import { useParams, useNavigate } from "react-router-dom";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import { HysVsDebtTab } from "@/components/decision-tools/HysVsDebtTab.tsx";
import { FourOhOneKTab } from "@/components/decision-tools/FourOhOneKTab.tsx";

type Tab = "hys-vs-debt" | "401k-optimizer";

const VALID_TABS: Tab[] = ["hys-vs-debt", "401k-optimizer"];

const TABS: { value: Tab; label: string }[] = [
  { value: "hys-vs-debt", label: "HYS vs. Debt" },
  { value: "401k-optimizer", label: "401(k) Optimizer" },
];

export function DecisionToolsPage() {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const tab: Tab = VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "hys-vs-debt";

  function handleTabChange(value: Tab) {
    navigate(`/decision-tools/${value}`, { replace: true });
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl md:text-3xl text-foreground">Decision Tools</h1>
      </div>

      <TabSwitcher options={TABS} value={tab} onChange={handleTabChange} />

      {tab === "hys-vs-debt" ? (
        <HysVsDebtTab />
      ) : (
        <FourOhOneKTab />
      )}
    </div>
  );
}
