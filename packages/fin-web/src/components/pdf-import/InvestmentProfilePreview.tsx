import type { InvestmentProfileData } from "@derekentringer/shared/finance";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InvestmentProfilePreviewProps {
  investmentProfile: InvestmentProfileData;
  onInvestmentProfileChange: (data: InvestmentProfileData) => void;
}

export function InvestmentProfilePreview({
  investmentProfile,
  onInvestmentProfileChange,
}: InvestmentProfilePreviewProps) {
  function updateField(field: keyof InvestmentProfileData, value: string) {
    onInvestmentProfileChange({
      ...investmentProfile,
      [field]: value === "" ? undefined : value,
    });
  }

  function updateNumField(field: keyof InvestmentProfileData, value: string) {
    const num = parseFloat(value);
    onInvestmentProfileChange({
      ...investmentProfile,
      [field]: value === "" ? undefined : isNaN(num) ? undefined : num,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Investment Details
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Period Start</Label>
          <Input
            type="date"
            value={investmentProfile.periodStart ?? ""}
            onChange={(e) => updateField("periodStart", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Period End</Label>
          <Input
            type="date"
            value={investmentProfile.periodEnd ?? ""}
            onChange={(e) => updateField("periodEnd", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Rate of Return (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={investmentProfile.rateOfReturn ?? ""}
            onChange={(e) => updateNumField("rateOfReturn", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">YTD Return (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={investmentProfile.ytdReturn ?? ""}
            onChange={(e) => updateNumField("ytdReturn", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Total Gain/Loss</Label>
          <Input
            type="number"
            step="0.01"
            value={investmentProfile.totalGainLoss ?? ""}
            onChange={(e) => updateNumField("totalGainLoss", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Contributions</Label>
          <Input
            type="number"
            step="0.01"
            value={investmentProfile.contributions ?? ""}
            onChange={(e) => updateNumField("contributions", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Employer Match</Label>
          <Input
            type="number"
            step="0.01"
            value={investmentProfile.employerMatch ?? ""}
            onChange={(e) => updateNumField("employerMatch", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Vesting (%)</Label>
          <Input
            type="number"
            step="0.1"
            value={investmentProfile.vestingPct ?? ""}
            onChange={(e) => updateNumField("vestingPct", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Fees</Label>
          <Input
            type="number"
            step="0.01"
            value={investmentProfile.fees ?? ""}
            onChange={(e) => updateNumField("fees", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Expense Ratio (%)</Label>
          <Input
            type="number"
            step="0.001"
            value={investmentProfile.expenseRatio ?? ""}
            onChange={(e) => updateNumField("expenseRatio", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Dividends</Label>
          <Input
            type="number"
            step="0.01"
            value={investmentProfile.dividends ?? ""}
            onChange={(e) => updateNumField("dividends", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Capital Gains</Label>
          <Input
            type="number"
            step="0.01"
            value={investmentProfile.capitalGains ?? ""}
            onChange={(e) => updateNumField("capitalGains", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Num Holdings</Label>
          <Input
            type="number"
            step="1"
            value={investmentProfile.numHoldings ?? ""}
            onChange={(e) => updateNumField("numHoldings", e.target.value)}
            className="text-sm"
          />
        </div>
      </div>
    </div>
  );
}
