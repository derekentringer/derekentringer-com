import { useState } from "react";
import type { FormEvent } from "react";
import type {
  IncomeSource,
  IncomeSourceFrequency,
  CreateIncomeSourceRequest,
  UpdateIncomeSourceRequest,
} from "@derekentringer/shared/finance";
import {
  INCOME_SOURCE_FREQUENCIES,
  INCOME_SOURCE_FREQUENCY_LABELS,
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
import {
  createIncomeSource,
  updateIncomeSource,
} from "@/api/incomeSources.ts";

interface IncomeSourceFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  incomeSource?: IncomeSource;
}

export function IncomeSourceForm({
  open,
  onClose,
  onSaved,
  incomeSource,
}: IncomeSourceFormProps) {
  const isEdit = !!incomeSource;

  const [name, setName] = useState(incomeSource?.name ?? "");
  const [amount, setAmount] = useState(incomeSource?.amount?.toString() ?? "");
  const [frequency, setFrequency] = useState<IncomeSourceFrequency>(
    incomeSource?.frequency ?? "monthly",
  );
  const [notes, setNotes] = useState(incomeSource?.notes ?? "");
  const [isActive, setIsActive] = useState(incomeSource?.isActive ?? true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const amountNum = parseFloat(amount) || 0;

      if (isEdit) {
        const data: UpdateIncomeSourceRequest = {};
        if (name !== incomeSource!.name) data.name = name;
        if (amountNum !== incomeSource!.amount) data.amount = amountNum;
        if (frequency !== incomeSource!.frequency) data.frequency = frequency;
        const n = notes || null;
        if (n !== (incomeSource!.notes ?? null)) data.notes = n;
        if (isActive !== incomeSource!.isActive) data.isActive = isActive;

        if (Object.keys(data).length === 0) {
          onClose();
          return;
        }
        await updateIncomeSource(incomeSource!.id, data);
      } else {
        const data: CreateIncomeSourceRequest = {
          name,
          amount: amountNum,
          frequency,
        };
        if (notes) data.notes = notes;
        if (!isActive) data.isActive = false;
        await createIncomeSource(data);
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save income source",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Income Source" : "Add Income Source"}
          </DialogTitle>
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
              min="0.01"
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
              onValueChange={(v) => setFrequency(v as IncomeSourceFrequency)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCOME_SOURCE_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {INCOME_SOURCE_FREQUENCY_LABELS[f]}
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
              id="incomeIsActive"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            <label
              htmlFor="incomeIsActive"
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
