import { useState } from "react";
import type { FormEvent } from "react";
import type {
  Category,
  CategoryRule,
  RuleMatchType,
  CreateCategoryRuleRequest,
  UpdateCategoryRuleRequest,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategoryRuleFormProps {
  rule?: CategoryRule | null;
  categories: Category[];
  onSubmit: (
    data: CreateCategoryRuleRequest | UpdateCategoryRuleRequest,
    options: { apply: boolean },
  ) => Promise<number | undefined>;
  onClose: () => void;
}

export function CategoryRuleForm({
  rule,
  categories,
  onSubmit,
  onClose,
}: CategoryRuleFormProps) {
  const isEdit = !!rule;

  const [pattern, setPattern] = useState(rule?.pattern ?? "");
  const [matchType, setMatchType] = useState<RuleMatchType>(
    rule?.matchType ?? "contains",
  );
  const [category, setCategory] = useState(rule?.category ?? "");
  const [priority, setPriority] = useState(
    rule?.priority?.toString() ?? "",
  );
  const [apply, setApply] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const data: CreateCategoryRuleRequest = {
        pattern: pattern.trim(),
        matchType,
        category,
      };
      if (priority) data.priority = parseInt(priority, 10);
      const count = await onSubmit(data, { apply });
      if (apply && count !== undefined) {
        setAppliedCount(count);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rule");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Rule" : "Add Rule"}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <Label>Pattern</Label>
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g. AMAZON or Starbucks"
              required
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Match Type</Label>
            <Select
              value={matchType}
              onValueChange={(v) => setMatchType(v as RuleMatchType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="exact">Exact</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Category</Label>
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
          </div>
          <div className="flex flex-col gap-1">
            <Label>Priority</Label>
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              placeholder="0 = highest priority"
            />
          </div>
          {appliedCount === null && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={apply}
                onChange={(e) => setApply(e.target.checked)}
                className="rounded"
              />
              Apply to existing transactions
            </label>
          )}
          {error && <p className="text-sm text-error text-center">{error}</p>}
          {appliedCount !== null && (
            <p className="text-sm text-green-400 text-center">
              Updated {appliedCount} transaction{appliedCount !== 1 ? "s" : ""}
            </p>
          )}
          <div className="flex gap-3 justify-end mt-2">
            {appliedCount !== null ? (
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            ) : (
              <>
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
                  disabled={isSubmitting || !pattern.trim() || !category}
                >
                  {isSubmitting ? "Saving..." : isEdit ? "Save" : "Create"}
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
