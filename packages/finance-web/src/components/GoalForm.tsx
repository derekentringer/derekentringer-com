import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import type {
  Goal,
  GoalType,
  CreateGoalRequest,
  UpdateGoalRequest,
  SavingsAccountSummary,
  DebtAccountSummary,
} from "@derekentringer/shared/finance";
import { GOAL_TYPE_LABELS } from "@derekentringer/shared/finance";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { fetchSavingsAccounts, fetchDebtAccounts } from "@/api/projections.ts";
import { formatCurrencyFull } from "@/lib/chartTheme";

const GOAL_TYPES: GoalType[] = ["savings", "debt_payoff", "net_worth", "custom"];

interface GoalFormProps {
  goal?: Goal | null;
  onSubmit: (data: CreateGoalRequest | UpdateGoalRequest) => Promise<void>;
  onClose: () => void;
}

export function GoalForm({ goal, onSubmit, onClose }: GoalFormProps) {
  const isEdit = !!goal;

  const [name, setName] = useState(goal?.name ?? "");
  const [type, setType] = useState<GoalType>(goal?.type ?? "savings");
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount?.toString() ?? "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [priority, setPriority] = useState(goal?.priority?.toString() ?? "1");
  const [accountIds, setAccountIds] = useState<string[]>(goal?.accountIds ?? []);
  const [extraPayment, setExtraPayment] = useState(goal?.extraPayment?.toString() ?? "");
  const [monthlyContribution, setMonthlyContribution] = useState(goal?.monthlyContribution?.toString() ?? "");
  const [startDate, setStartDate] = useState(goal?.startDate ?? "");
  const [startAmount, setStartAmount] = useState(goal?.startAmount?.toString() ?? "");
  const [currentAmount, setCurrentAmount] = useState(goal?.currentAmount?.toString() ?? "");
  const [notes, setNotes] = useState(goal?.notes ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccountSummary[]>([]);
  const [debtAccounts, setDebtAccounts] = useState<DebtAccountSummary[]>([]);

  useEffect(() => {
    fetchSavingsAccounts()
      .then(({ accounts }) => setSavingsAccounts(accounts))
      .catch(() => {});
    fetchDebtAccounts({ includeMortgages: true })
      .then(({ accounts }) => {
        setDebtAccounts(accounts);
        // Auto-recalculate debt target from linked accounts on load
        if (type === "debt_payoff" && accountIds.length > 0) {
          const total = accounts
            .filter((a) => accountIds.includes(a.accountId))
            .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
          if (total > 0) setTargetAmount(total.toString());
        }
      })
      .catch(() => {});
  }, []);

  const showLinkedAccounts = type === "savings" || type === "debt_payoff";
  const showExtraPayment = type === "debt_payoff";
  const showMonthlyContribution = type === "savings" || type === "custom";
  const showCurrentAmount = type === "custom";

  const availableAccounts = type === "savings"
    ? savingsAccounts.map((a) => ({ id: a.accountId, name: a.accountName, balance: undefined as number | undefined }))
    : type === "debt_payoff"
      ? debtAccounts.map((a) => ({ id: a.accountId, name: a.name, balance: Math.abs(a.currentBalance) }))
      : [];

  function computeDebtTarget(selectedIds: string[]) {
    return debtAccounts
      .filter((a) => selectedIds.includes(a.accountId))
      .reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
  }

  function toggleAccount(id: string) {
    setAccountIds((prev) => {
      const next = prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id];
      if (type === "debt_payoff") {
        const total = computeDebtTarget(next);
        setTargetAmount(total > 0 ? total.toString() : "");
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const targetAmountNum = parseFloat(targetAmount) || 0;

      if (isEdit) {
        const data: UpdateGoalRequest = {};
        if (name !== goal!.name) data.name = name;
        if (type !== goal!.type) data.type = type;
        if (targetAmountNum !== goal!.targetAmount) data.targetAmount = targetAmountNum;
        const td = targetDate || null;
        if (td !== (goal!.targetDate ?? null)) data.targetDate = td;
        const p = parseInt(priority) || 0;
        if (p !== goal!.priority) data.priority = p;

        if (showLinkedAccounts) {
          const prevIds = (goal!.accountIds ?? []).slice().sort().join(",");
          const newIds = accountIds.slice().sort().join(",");
          if (prevIds !== newIds) data.accountIds = accountIds.length > 0 ? accountIds : null;
        }

        if (showExtraPayment) {
          const ep = parseFloat(extraPayment) || null;
          if (ep !== (goal!.extraPayment ?? null)) data.extraPayment = ep;
        }

        if (showMonthlyContribution) {
          const mc = parseFloat(monthlyContribution) || null;
          if (mc !== (goal!.monthlyContribution ?? null)) data.monthlyContribution = mc;
        }

        const sd = startDate || null;
        if (sd !== (goal!.startDate ?? null)) data.startDate = sd;
        const sa = startAmount ? parseFloat(startAmount) : null;
        if (sa !== (goal!.startAmount ?? null)) data.startAmount = sa;

        if (showCurrentAmount) {
          const ca = currentAmount ? parseFloat(currentAmount) : null;
          if (ca !== (goal!.currentAmount ?? null)) data.currentAmount = ca;
        }

        const n = notes || null;
        if (n !== (goal!.notes ?? null)) data.notes = n;

        if (Object.keys(data).length === 0) {
          onClose();
          return;
        }
        await onSubmit(data);
      } else {
        const data: CreateGoalRequest = {
          name,
          type,
          targetAmount: targetAmountNum,
        };
        if (targetDate) data.targetDate = targetDate;
        const p = parseInt(priority) || 0;
        if (p > 0) data.priority = p;
        if (showLinkedAccounts && accountIds.length > 0) data.accountIds = accountIds;
        if (showExtraPayment && extraPayment) data.extraPayment = parseFloat(extraPayment);
        if (showMonthlyContribution && monthlyContribution) data.monthlyContribution = parseFloat(monthlyContribution);
        if (startDate) data.startDate = startDate;
        if (startAmount) data.startAmount = parseFloat(startAmount);
        if (showCurrentAmount && currentAmount) data.currentAmount = parseFloat(currentAmount);
        if (notes) data.notes = notes;
        await onSubmit(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Goal" : "Add Goal"}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label>Type <span className="text-destructive">*</span></Label>
            <Select value={type} onValueChange={(v) => setType(v as GoalType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOAL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {GOAL_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Target Amount <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              step="0.01"
              min={type === "debt_payoff" ? "0" : "1"}
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label>Start Date (optional)</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label>Starting Amount (optional)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={startAmount}
              onChange={(e) => setStartAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label>Target Date (optional)</Label>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label>Priority</Label>
            <Input
              type="number"
              min="1"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>

          {showLinkedAccounts && availableAccounts.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label>Linked Accounts</Label>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto border rounded-md p-2">
                {availableAccounts.map((acct) => (
                  <div key={acct.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`acct-${acct.id}`}
                      checked={accountIds.includes(acct.id)}
                      onCheckedChange={() => toggleAccount(acct.id)}
                    />
                    <label
                      htmlFor={`acct-${acct.id}`}
                      className="text-sm text-foreground cursor-pointer flex-1"
                    >
                      {acct.name}
                    </label>
                    {acct.balance != null && (
                      <span className="text-xs text-muted-foreground">{formatCurrencyFull(acct.balance)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showExtraPayment && (
            <div className="flex flex-col gap-1">
              <Label>Extra Monthly Payment</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={extraPayment}
                onChange={(e) => setExtraPayment(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {showMonthlyContribution && (
            <div className="flex flex-col gap-1">
              <Label>Monthly Contribution</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {showCurrentAmount && (
            <div className="flex flex-col gap-1">
              <Label>Current Amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label>Notes</Label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
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
              disabled={isSubmitting || !name || targetAmount === ""}
            >
              {isSubmitting ? "Saving..." : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
