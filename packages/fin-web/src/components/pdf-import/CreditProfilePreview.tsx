import type { CreditProfileData } from "@derekentringer/shared/finance";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreditProfilePreviewProps {
  creditProfile: CreditProfileData;
  onCreditProfileChange: (data: CreditProfileData) => void;
}

export function CreditProfilePreview({
  creditProfile,
  onCreditProfileChange,
}: CreditProfilePreviewProps) {
  function updateField(field: keyof CreditProfileData, value: string) {
    onCreditProfileChange({
      ...creditProfile,
      [field]: value === "" ? undefined : value,
    });
  }

  function updateNumField(field: keyof CreditProfileData, value: string) {
    const num = parseFloat(value);
    onCreditProfileChange({
      ...creditProfile,
      [field]: value === "" ? undefined : isNaN(num) ? undefined : num,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Credit Card Details
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Period Start</Label>
          <Input
            type="date"
            value={creditProfile.periodStart ?? ""}
            onChange={(e) => updateField("periodStart", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Period End</Label>
          <Input
            type="date"
            value={creditProfile.periodEnd ?? ""}
            onChange={(e) => updateField("periodEnd", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">APR (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={creditProfile.apr ?? ""}
            onChange={(e) => updateNumField("apr", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Minimum Payment</Label>
          <Input
            type="number"
            step="0.01"
            value={creditProfile.minimumPayment ?? ""}
            onChange={(e) => updateNumField("minimumPayment", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Credit Limit</Label>
          <Input
            type="number"
            step="0.01"
            value={creditProfile.creditLimit ?? ""}
            onChange={(e) => updateNumField("creditLimit", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Available Credit</Label>
          <Input
            type="number"
            step="0.01"
            value={creditProfile.availableCredit ?? ""}
            onChange={(e) => updateNumField("availableCredit", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Interest Charged</Label>
          <Input
            type="number"
            step="0.01"
            value={creditProfile.interestCharged ?? ""}
            onChange={(e) => updateNumField("interestCharged", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Fees Charged</Label>
          <Input
            type="number"
            step="0.01"
            value={creditProfile.feesCharged ?? ""}
            onChange={(e) => updateNumField("feesCharged", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Rewards Earned</Label>
          <Input
            type="number"
            step="0.01"
            value={creditProfile.rewardsEarned ?? ""}
            onChange={(e) => updateNumField("rewardsEarned", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Payment Due Date</Label>
          <Input
            type="date"
            value={creditProfile.paymentDueDate ?? ""}
            onChange={(e) => updateField("paymentDueDate", e.target.value)}
            className="text-sm"
          />
        </div>
      </div>
    </div>
  );
}
