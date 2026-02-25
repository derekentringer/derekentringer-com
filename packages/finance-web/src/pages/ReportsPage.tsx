import { useParams, useNavigate } from "react-router-dom";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import { AiDigest } from "@/components/reports/AiDigest.tsx";

type ReportTab = "monthly" | "quarterly";

const VALID_TABS: ReportTab[] = ["monthly", "quarterly"];

const TABS: { value: ReportTab; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

export function ReportsPage() {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();

  const activeTab: ReportTab = VALID_TABS.includes(tabParam as ReportTab)
    ? (tabParam as ReportTab)
    : "monthly";

  function handleTabChange(tab: ReportTab) {
    navigate(`/reports/${tab}`, { replace: true });
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl md:text-3xl text-foreground">Reports</h1>
      </div>

      <TabSwitcher options={TABS} value={activeTab} onChange={handleTabChange} />

      <AiDigest type={activeTab} />
    </div>
  );
}
