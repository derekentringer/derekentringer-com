import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import type {
  IncomeSource,
  IncomeSourceFrequency,
  DetectedIncomePattern,
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
import { Badge } from "@/components/ui/badge";
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
  fetchDetectedIncome,
} from "@/api/incomeSources.ts";
import { formatCurrencyFull } from "@/lib/chartTheme";

interface IncomeSourceFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  incomeSource?: IncomeSource;
  existingNames?: string[];
}

export function IncomeSourceForm({
  open,
  onClose,
  onSaved,
  incomeSource,
  existingNames = [],
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
  const [suggestions, setSuggestions] = useState<DetectedIncomePattern[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  useEffect(() => {
    if (!open || isEdit) return;
    setSuggestionsLoading(true);
    fetchDetectedIncome()
      .then(({ patterns }) => {
        const lowerNames = existingNames.map((n) => n.toLowerCase());
        setSuggestions(
          patterns.filter(
            (p) => !lowerNames.includes(p.description.toLowerCase()),
          ),
        );
      })
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, [open, isEdit, existingNames]);

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
      <DialogContent className={`max-h-[90vh] overflow-y-auto ${!isEdit && suggestions.length > 0 ? "max-w-2xl" : ""}`}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Income Source" : "Add Income Source"}
          </DialogTitle>
        </DialogHeader>

        {!isEdit && suggestionsLoading && (
          <div className="flex flex-col gap-2 mb-1">
            <p className="text-sm text-muted-foreground">Detected from transactions:</p>
            <div className="space-y-1.5">
              {[1, 2].map((i) => (
                <div key={i} className="h-9 rounded-md border border-border bg-muted/30 animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {!isEdit && !suggestionsLoading && suggestions.length > 0 && (
          <div className="flex flex-col gap-2 mb-1">
            <p className="text-sm text-muted-foreground">Detected from transactions:</p>
            <div className="rounded-md border border-border divide-y divide-border">
              {suggestions.map((pattern) => (
                <button
                  key={pattern.description}
                  type="button"
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    setName(pattern.description);
                    setAmount(pattern.averageAmount.toString());
                    setFrequency(pattern.frequency);
                  }}
                >
                  <span className="font-medium truncate">{pattern.description}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-success">{formatCurrencyFull(pattern.monthlyEquivalent)}/mo</span>
                    <Badge variant="success" className="text-xs">
                      {INCOME_SOURCE_FREQUENCY_LABELS[pattern.frequency]}
                    </Badge>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

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
