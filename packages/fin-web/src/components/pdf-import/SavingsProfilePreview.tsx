import type { SavingsProfileData } from "@derekentringer/shared/finance";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SavingsProfilePreviewProps {
  savingsProfile: SavingsProfileData;
  onSavingsProfileChange: (data: SavingsProfileData) => void;
  updateInterestRate: boolean;
  onUpdateInterestRateChange: (value: boolean) => void;
}

export function SavingsProfilePreview({
  savingsProfile,
  onSavingsProfileChange,
  updateInterestRate,
  onUpdateInterestRateChange,
}: SavingsProfilePreviewProps) {
  function updateField(field: keyof SavingsProfileData, value: string) {
    onSavingsProfileChange({
      ...savingsProfile,
      [field]: value === "" ? undefined : value,
    });
  }

  function updateNumField(field: keyof SavingsProfileData, value: string) {
    const num = parseFloat(value);
    onSavingsProfileChange({
      ...savingsProfile,
      [field]: value === "" ? undefined : isNaN(num) ? undefined : num,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Savings Details
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Period Start</Label>
          <Input
            type="date"
            value={savingsProfile.periodStart ?? ""}
            onChange={(e) => updateField("periodStart", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Period End</Label>
          <Input
            type="date"
            value={savingsProfile.periodEnd ?? ""}
            onChange={(e) => updateField("periodEnd", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">APY (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={savingsProfile.apy ?? ""}
            onChange={(e) => updateNumField("apy", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Interest Earned</Label>
          <Input
            type="number"
            step="0.01"
            value={savingsProfile.interestEarned ?? ""}
            onChange={(e) => updateNumField("interestEarned", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Interest Earned YTD</Label>
          <Input
            type="number"
            step="0.01"
            value={savingsProfile.interestEarnedYtd ?? ""}
            onChange={(e) => updateNumField("interestEarnedYtd", e.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="updateInterestRate"
          checked={updateInterestRate}
          onCheckedChange={(checked) =>
            onUpdateInterestRateChange(checked === true)
          }
        />
        <Label htmlFor="updateInterestRate" className="text-sm cursor-pointer">
          Also update account's interest rate (APY)
        </Label>
      </div>
    </div>
  );
}
