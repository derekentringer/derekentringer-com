import { useState, useEffect, useMemo } from "react";
import type { FormEvent } from "react";
import type {
  Bill,
  BillFrequency,
  CreateBillRequest,
  UpdateBillRequest,
  Account,
} from "@derekentringer/shared/finance";
import {
  BILL_FREQUENCIES,
  BILL_FREQUENCY_LABELS,
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
import { fetchAccounts } from "@/api/accounts.ts";
import { fetchCategories } from "@/api/categories.ts";

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function computeNextDates(
  frequency: string,
  dueDay: number,
  dueMonth?: number,
  dueWeekday?: number,
): Date[] {
  const dates: Date[] = [];
  const now = new Date();

  if (frequency === "monthly") {
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const day = Math.min(
        dueDay,
        new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
      );
      const date = new Date(d.getFullYear(), d.getMonth(), day);
      if (date >= now || dates.length < 3) dates.push(date);
      if (dates.length >= 3) break;
    }
  } else if (frequency === "quarterly") {
    for (let i = 0; i < 12 && dates.length < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      if (d.getMonth() % 3 === 0) {
        const day = Math.min(
          dueDay,
          new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
        );
        dates.push(new Date(d.getFullYear(), d.getMonth(), day));
      }
    }
  } else if (frequency === "yearly" && dueMonth) {
    const month = dueMonth - 1;
    for (let y = now.getFullYear(); dates.length < 3; y++) {
      const day = Math.min(
        dueDay,
        new Date(y, month + 1, 0).getDate(),
      );
      const date = new Date(y, month, day);
      if (date >= now || dates.length === 0) dates.push(date);
    }
  } else if (
    (frequency === "weekly" || frequency === "biweekly") &&
    dueWeekday !== undefined
  ) {
    const cursor = new Date(now);
    const diff = (dueWeekday - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + diff);
    const inc = frequency === "biweekly" ? 14 : 7;
    for (let i = 0; i < 3; i++) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + inc);
    }
  }

  return dates.slice(0, 3);
}

interface BillFormProps {
  bill?: Bill | null;
  onSubmit: (data: CreateBillRequest | UpdateBillRequest) => Promise<void>;
  onClose: () => void;
}

export function BillForm({ bill, onSubmit, onClose }: BillFormProps) {
  const isEdit = !!bill;

  const [name, setName] = useState(bill?.name ?? "");
  const [amount, setAmount] = useState(bill?.amount?.toString() ?? "");
  const [frequency, setFrequency] = useState<BillFrequency>(
    bill?.frequency ?? "monthly",
  );
  const [dueDay, setDueDay] = useState(bill?.dueDay?.toString() ?? "1");
  const [dueMonth, setDueMonth] = useState(
    bill?.dueMonth?.toString() ?? "",
  );
  const [dueWeekday, setDueWeekday] = useState(
    bill?.dueWeekday?.toString() ?? "1",
  );
  const [category, setCategory] = useState(bill?.category ?? "");
  const [accountId, setAccountId] = useState(bill?.accountId ?? "");
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [isActive, setIsActive] = useState(bill?.isActive ?? true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [categories, setCategories] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    fetchCategories()
      .then(({ categories }) => setCategories(categories.map((c) => c.name)))
      .catch(() => {});
    fetchAccounts()
      .then(({ accounts }) => setAccounts(accounts))
      .catch(() => {});
  }, []);

  const showDayOfMonth =
    frequency === "monthly" || frequency === "quarterly";
  const showYearlyFields = frequency === "yearly";
  const showWeekday = frequency === "weekly" || frequency === "biweekly";

  const nextDates = useMemo(() => {
    const day = parseInt(dueDay) || 1;
    const month = dueMonth ? parseInt(dueMonth) : undefined;
    const weekday = dueWeekday ? parseInt(dueWeekday) : undefined;
    return computeNextDates(frequency, day, month, weekday);
  }, [frequency, dueDay, dueMonth, dueWeekday]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const dayNum = parseInt(dueDay) || 1;
      const amountNum = parseFloat(amount) || 0;

      if (isEdit) {
        const data: UpdateBillRequest = {};
        if (name !== bill!.name) data.name = name;
        if (amountNum !== bill!.amount) data.amount = amountNum;
        if (frequency !== bill!.frequency) data.frequency = frequency;
        if (dayNum !== bill!.dueDay) data.dueDay = dayNum;

        if (showYearlyFields) {
          const monthNum = dueMonth ? parseInt(dueMonth) : null;
          if (monthNum !== (bill!.dueMonth ?? null)) data.dueMonth = monthNum;
        } else if (bill!.dueMonth) {
          data.dueMonth = null;
        }

        if (showWeekday) {
          const weekdayNum = parseInt(dueWeekday);
          if (weekdayNum !== (bill!.dueWeekday ?? null))
            data.dueWeekday = weekdayNum;
        } else if (bill!.dueWeekday !== undefined && bill!.dueWeekday !== null) {
          data.dueWeekday = null;
        }

        const cat = category || null;
        if (cat !== (bill!.category ?? null)) data.category = cat;
        const acct = accountId || null;
        if (acct !== (bill!.accountId ?? null)) data.accountId = acct;
        const n = notes || null;
        if (n !== (bill!.notes ?? null)) data.notes = n;
        if (isActive !== bill!.isActive) data.isActive = isActive;

        if (Object.keys(data).length === 0) {
          onClose();
          return;
        }
        await onSubmit(data);
      } else {
        const data: CreateBillRequest = {
          name,
          amount: amountNum,
          frequency,
          dueDay: dayNum,
        };
        if (showYearlyFields && dueMonth)
          data.dueMonth = parseInt(dueMonth);
        if (showWeekday) data.dueWeekday = parseInt(dueWeekday);
        if (category) data.category = category;
        if (accountId) data.accountId = accountId;
        if (notes) data.notes = notes;
        if (!isActive) data.isActive = false;
        await onSubmit(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bill");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Bill" : "Add Bill"}</DialogTitle>
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
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Frequency</Label>
            <Select
              value={frequency}
              onValueChange={(v) => setFrequency(v as BillFrequency)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BILL_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {BILL_FREQUENCY_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showDayOfMonth && (
            <div className="flex flex-col gap-1">
              <Label>Day of month</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
          )}

          {showYearlyFields && (
            <>
              <div className="flex flex-col gap-1">
                <Label>What date each year?</Label>
                <Select
                  value={dueMonth || ""}
                  onValueChange={(v) => setDueMonth(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_LABELS.map((label, i) => (
                      <SelectItem key={i} value={String(i + 1)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Day of month</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                />
              </div>
            </>
          )}

          {showWeekday && (
            <div className="flex flex-col gap-1">
              <Label>What day of the week?</Label>
              <Select
                value={dueWeekday}
                onValueChange={(v) => setDueWeekday(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_LABELS.map((label, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {nextDates.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Next dates:{" "}
              {nextDates
                .map((d) =>
                  d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }),
                )
                .join(", ")}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label>Category</Label>
            <Select
              value={category || "__none__"}
              onValueChange={(v) => setCategory(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Account</Label>
            <Select
              value={accountId || "__none__"}
              onValueChange={(v) => setAccountId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Notes</Label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="billIsActive"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            <label
              htmlFor="billIsActive"
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
              disabled={isSubmitting || !name || !amount}
            >
              {isSubmitting ? "Saving..." : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
