import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import {
  AccountType,
  CSV_PARSER_IDS,
  CSV_PARSER_LABELS,
  type Account,
  type CreateAccountRequest,
  type UpdateAccountRequest,
  type CsvParserId,
} from "@derekentringer/shared/finance";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.Checking]: "Checking",
  [AccountType.Savings]: "Savings",
  [AccountType.HighYieldSavings]: "High Yield Savings",
  [AccountType.Credit]: "Credit",
  [AccountType.Investment]: "Investment",
  [AccountType.Loan]: "Loan",
  [AccountType.Other]: "Other",
};

const INTEREST_RATE_TYPES = new Set([
  AccountType.HighYieldSavings,
  AccountType.Savings,
  AccountType.Loan,
]);

interface AccountFormProps {
  account?: Account | null;
  onSubmit: (data: CreateAccountRequest | UpdateAccountRequest) => Promise<void>;
  onClose: () => void;
}

export function AccountForm({ account, onSubmit, onClose }: AccountFormProps) {
  const isEdit = !!account;

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(
    account?.type ?? AccountType.Checking,
  );
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [currentBalance, setCurrentBalance] = useState(
    account?.currentBalance?.toString() ?? "",
  );
  const [accountNumber, setAccountNumber] = useState(
    account?.accountNumber ?? "",
  );
  const [interestRate, setInterestRate] = useState(
    account?.interestRate?.toString() ?? "",
  );
  const [csvParserId, setCsvParserId] = useState(account?.csvParserId ?? "");
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!INTEREST_RATE_TYPES.has(type)) {
      setInterestRate("");
    }
  }, [type]);

  const showInterestRate = INTEREST_RATE_TYPES.has(type);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isEdit) {
        const data: UpdateAccountRequest = {};
        if (name !== account!.name) data.name = name;
        if (type !== account!.type) data.type = type;
        if (institution !== account!.institution) data.institution = institution;
        const balNum = currentBalance ? parseFloat(currentBalance) : 0;
        if (balNum !== account!.currentBalance) data.currentBalance = balNum;
        const acctNum = accountNumber || null;
        if (acctNum !== (account!.accountNumber ?? null))
          data.accountNumber = acctNum;
        const rate = interestRate ? parseFloat(interestRate) : null;
        if (rate !== (account!.interestRate ?? null)) data.interestRate = rate;
        const parser = csvParserId || null;
        if (parser !== (account!.csvParserId ?? null))
          data.csvParserId = parser;
        if (isActive !== account!.isActive) data.isActive = isActive;
        await onSubmit(data);
      } else {
        const data: CreateAccountRequest = {
          name,
          type,
          institution,
          currentBalance: currentBalance ? parseFloat(currentBalance) : 0,
        };
        if (accountNumber) data.accountNumber = accountNumber;
        if (interestRate) data.interestRate = parseFloat(interestRate);
        if (csvParserId) data.csvParserId = csvParserId;
        if (!isActive) data.isActive = false;
        await onSubmit(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Account" : "Add Account"}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <Label>Name</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Institution</Label>
            <Input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Balance</Label>
            <Input
              type="number"
              step="0.01"
              value={currentBalance}
              onChange={(e) => setCurrentBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Account Number</Label>
            <Input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Optional"
            />
          </div>
          {showInterestRate && (
            <div className="flex flex-col gap-1">
              <Label>Interest Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                placeholder="Optional"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label>CSV Parser</Label>
            <Select
              value={csvParserId || "__none__"}
              onValueChange={(v) => setCsvParserId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {CSV_PARSER_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {CSV_PARSER_LABELS[id as CsvParserId]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="isActive"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            <label
              htmlFor="isActive"
              className="text-sm text-foreground cursor-pointer"
            >
              Active
            </label>
          </div>
          {error && (
            <p className="text-sm text-error text-center">{error}</p>
          )}
          <div className="flex gap-3 justify-end mt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !name || !institution}
            >
              {isSubmitting ? "Saving..." : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
