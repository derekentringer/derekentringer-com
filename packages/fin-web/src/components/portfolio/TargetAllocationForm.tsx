import { useState, useMemo } from "react";
import type { AssetClass, TargetAllocation, Account } from "@derekentringer/shared/finance";
import { ASSET_CLASSES, ASSET_CLASS_LABELS } from "@derekentringer/shared/finance";
import { setTargetAllocations, fetchTargetAllocations } from "../../api/portfolio.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TargetAllocationFormProps {
  accounts: Account[];
  defaultAccountId?: string | null;
  existingAllocations?: TargetAllocation[];
  onClose: () => void;
  onSaved: () => void;
}

export function TargetAllocationForm({
  accounts,
  defaultAccountId,
  existingAllocations,
  onClose,
  onSaved,
}: TargetAllocationFormProps) {
  const [accountId, setAccountId] = useState<string>(defaultAccountId ?? "__all__");

  // Initialize percentages from existing allocations
  const initialPcts = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ac of ASSET_CLASSES) {
      const existing = existingAllocations?.find(
        (a) => a.assetClass === ac,
      );
      map[ac] = existing ? existing.targetPct.toString() : "";
    }
    return map;
  }, [existingAllocations]);

  const [pcts, setPcts] = useState<Record<string, string>>(initialPcts);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const sum = useMemo(() => {
    return ASSET_CLASSES.reduce((s, ac) => {
      const val = parseFloat(pcts[ac] || "0");
      return s + (Number.isFinite(val) ? val : 0);
    }, 0);
  }, [pcts]);

  const isValid = Math.abs(sum - 100) < 0.01;

  function handleChange(ac: string, value: string) {
    setPcts((prev) => ({ ...prev, [ac]: value }));
  }

  async function handleAccountChange(value: string) {
    setAccountId(value);
    // Reload allocations for the selected account
    try {
      const resolvedId = value === "__all__" ? null : value;
      const res = await fetchTargetAllocations(resolvedId);
      const newPcts: Record<string, string> = {};
      for (const ac of ASSET_CLASSES) {
        const existing = res.allocations.find((a) => a.assetClass === ac);
        newPcts[ac] = existing ? existing.targetPct.toString() : "";
      }
      setPcts(newPcts);
    } catch {
      // Keep current values if fetch fails
    }
  }

  const PRESETS: { label: string; description: string; values: Record<string, string> }[] = [
    {
      label: "Aggressive",
      description: "20s–30s",
      values: { stocks: "85", bonds: "5", real_estate: "0", cash: "5", crypto: "5", other: "0" },
    },
    {
      label: "Moderate",
      description: "40s–50s",
      values: { stocks: "60", bonds: "30", real_estate: "0", cash: "10", crypto: "0", other: "0" },
    },
    {
      label: "Conservative",
      description: "Near retirement",
      values: { stocks: "40", bonds: "40", real_estate: "0", cash: "20", crypto: "0", other: "0" },
    },
  ];

  function applyPreset(values: Record<string, string>) {
    setPcts(values);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) {
      setError("Allocations must sum to 100%");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const allocations = ASSET_CLASSES
        .filter((ac) => {
          const val = parseFloat(pcts[ac] || "0");
          return Number.isFinite(val) && val > 0;
        })
        .map((ac) => ({
          assetClass: ac as AssetClass,
          targetPct: parseFloat(pcts[ac]),
        }));

      const resolvedAccountId = accountId === "__all__" ? null : accountId;

      await setTargetAllocations({
        accountId: resolvedAccountId,
        allocations,
      });

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save allocations");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set Target Allocation</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-error">{error}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label>Scope</Label>
            <Select value={accountId} onValueChange={handleAccountChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Presets</Label>
            <div className="flex gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset.values)}
                  className="flex-1 rounded-lg border border-input px-3 py-2 text-left hover:bg-accent transition-colors"
                >
                  <span className="text-sm font-medium text-foreground">{preset.label}</span>
                  <span className="block text-xs text-muted-foreground">{preset.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {ASSET_CLASSES.map((ac) => (
              <div key={ac} className="flex items-center gap-3">
                <span className="text-sm text-foreground w-24 shrink-0">
                  {ASSET_CLASS_LABELS[ac]}
                </span>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={pcts[ac]}
                  onChange={(e) => handleChange(ac, e.target.value)}
                  placeholder="0"
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className={isValid ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
              {sum.toFixed(1)}%
            </span>
          </div>

          <div className="flex gap-3 justify-end mt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !isValid}>
              {isLoading ? "Saving..." : "Save Targets"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
