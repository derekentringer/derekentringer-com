import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import type {
  Budget,
  Category,
  CreateBudgetRequest,
  UpdateBudgetRequest,
} from "@derekentringer/shared/finance";
import { fetchCategories } from "@/api/categories";
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

interface BudgetFormProps {
  budget?: Budget | null;
  onSubmit: (data: CreateBudgetRequest | UpdateBudgetRequest) => Promise<void>;
  onClose: () => void;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function BudgetForm({ budget, onSubmit, onClose }: BudgetFormProps) {
  const isEdit = !!budget;

  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState(budget?.category ?? "");
  const [amount, setAmount] = useState(budget?.amount?.toString() ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(
    budget?.effectiveFrom ?? getCurrentMonth(),
  );
  const [notes, setNotes] = useState(budget?.notes ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories()
      .then(({ categories }) => setCategories(categories))
      .catch(() => setError("Failed to load categories"));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isEdit) {
        const data: UpdateBudgetRequest = {};
        const amtNum = amount ? parseFloat(amount) : 0;
        if (amtNum !== budget!.amount) data.amount = amtNum;
        const notesVal = notes || null;
        if (notesVal !== (budget!.notes ?? null)) data.notes = notesVal;
        if (Object.keys(data).length === 0) {
          onClose();
          return;
        }
        await onSubmit(data);
      } else {
        const data: CreateBudgetRequest = {
          category,
          amount: amount ? parseFloat(amount) : 0,
          effectiveFrom,
        };
        if (notes) data.notes = notes;
        await onSubmit(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save budget");
    } finally {
      setIsSubmitting(false);
    }
  }

  const displayMonth = effectiveFrom
    ? new Date(effectiveFrom + "-01").toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      })
    : "";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Budget" : "Set Budget"}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <Label>Category</Label>
            {isEdit ? (
              <Input type="text" value={budget!.category} disabled />
            ) : (
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              autoFocus
            />
          </div>
          {!isEdit && (
            <div className="flex flex-col gap-1">
              <Label>Effective From</Label>
              <Input
                type="month"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
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
          <p className="text-sm text-muted-foreground">
            This budget applies starting {displayMonth || "the selected month"}{" "}
            and continues until you change it.
          </p>
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
              disabled={isSubmitting || (!isEdit && !category) || !amount}
            >
              {isSubmitting ? "Saving..." : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
