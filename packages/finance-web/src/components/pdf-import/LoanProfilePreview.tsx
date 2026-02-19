import type { LoanProfileData, LoanStaticData } from "@derekentringer/shared/finance";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface LoanProfilePreviewProps {
  loanProfile: LoanProfileData;
  onLoanProfileChange: (data: LoanProfileData) => void;
  loanStatic: LoanStaticData;
  onLoanStaticChange: (data: LoanStaticData) => void;
  updateInterestRate: boolean;
  onUpdateInterestRateChange: (value: boolean) => void;
}

export function LoanProfilePreview({
  loanProfile,
  onLoanProfileChange,
  loanStatic,
  onLoanStaticChange,
  updateInterestRate,
  onUpdateInterestRateChange,
}: LoanProfilePreviewProps) {
  function updateField(field: keyof LoanProfileData, value: string) {
    onLoanProfileChange({ ...loanProfile, [field]: value === "" ? undefined : value });
  }

  function updateNumField(field: keyof LoanProfileData, value: string) {
    const num = parseFloat(value);
    onLoanProfileChange({ ...loanProfile, [field]: value === "" ? undefined : (isNaN(num) ? undefined : num) });
  }

  function updateStaticField(field: keyof LoanStaticData, value: string) {
    onLoanStaticChange({ ...loanStatic, [field]: value === "" ? undefined : value });
  }

  function updateStaticNumField(field: keyof LoanStaticData, value: string) {
    const num = parseFloat(value);
    onLoanStaticChange({ ...loanStatic, [field]: value === "" ? undefined : (isNaN(num) ? undefined : num) });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Loan Details
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Period Start</Label>
          <Input
            type="date"
            value={loanProfile.periodStart ?? ""}
            onChange={(e) => updateField("periodStart", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Period End</Label>
          <Input
            type="date"
            value={loanProfile.periodEnd ?? ""}
            onChange={(e) => updateField("periodEnd", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Interest Rate (%)</Label>
          <Input
            type="number"
            step="0.001"
            value={loanProfile.interestRate ?? ""}
            onChange={(e) => updateNumField("interestRate", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Monthly Payment</Label>
          <Input
            type="number"
            step="0.01"
            value={loanProfile.monthlyPayment ?? ""}
            onChange={(e) => updateNumField("monthlyPayment", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Principal Paid</Label>
          <Input
            type="number"
            step="0.01"
            value={loanProfile.principalPaid ?? ""}
            onChange={(e) => updateNumField("principalPaid", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Interest Paid</Label>
          <Input
            type="number"
            step="0.01"
            value={loanProfile.interestPaid ?? ""}
            onChange={(e) => updateNumField("interestPaid", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Escrow Amount</Label>
          <Input
            type="number"
            step="0.01"
            value={loanProfile.escrowAmount ?? ""}
            onChange={(e) => updateNumField("escrowAmount", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Next Payment Date</Label>
          <Input
            type="date"
            value={loanProfile.nextPaymentDate ?? ""}
            onChange={(e) => updateField("nextPaymentDate", e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Remaining Months</Label>
          <Input
            type="number"
            step="1"
            value={loanProfile.remainingTermMonths ?? ""}
            onChange={(e) => updateNumField("remainingTermMonths", e.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-2">
        Loan Static Info
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Original Balance</Label>
          <Input
            type="number"
            step="0.01"
            value={loanStatic.originalBalance ?? ""}
            onChange={(e) => updateStaticNumField("originalBalance", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Loan Type</Label>
          <Input
            type="text"
            value={loanStatic.loanType ?? ""}
            onChange={(e) => updateStaticField("loanType", e.target.value)}
            placeholder="fixed / variable / fixed-mortgage"
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Origination Date</Label>
          <Input
            type="date"
            value={loanStatic.originationDate ?? ""}
            onChange={(e) => updateStaticField("originationDate", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Maturity Date</Label>
          <Input
            type="date"
            value={loanStatic.maturityDate ?? ""}
            onChange={(e) => updateStaticField("maturityDate", e.target.value)}
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
          Also update account's interest rate
        </Label>
      </div>
    </div>
  );
}
