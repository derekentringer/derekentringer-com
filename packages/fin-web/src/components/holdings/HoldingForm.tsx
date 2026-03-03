import { useState } from "react";
import type { Holding, AssetClass, Account } from "@derekentringer/shared/finance";
import { ASSET_CLASSES, ASSET_CLASS_LABELS } from "@derekentringer/shared/finance";
import { createHolding, updateHolding, fetchQuote } from "../../api/holdings.ts";
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
import { RefreshCw } from "lucide-react";

interface HoldingFormProps {
  holding?: Holding | null;
  accounts: Account[];
  defaultAccountId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function HoldingForm({
  holding,
  accounts,
  defaultAccountId,
  onClose,
  onSaved,
}: HoldingFormProps) {
  const isEditing = !!holding;

  const [accountId, setAccountId] = useState(holding?.accountId ?? defaultAccountId);
  const [name, setName] = useState(holding?.name ?? "");
  const [ticker, setTicker] = useState(holding?.ticker ?? "");
  const [shares, setShares] = useState(holding?.shares?.toString() ?? "");
  const [costBasis, setCostBasis] = useState(holding?.costBasis?.toString() ?? "");
  const [currentPrice, setCurrentPrice] = useState(holding?.currentPrice?.toString() ?? "");
  const [assetClass, setAssetClass] = useState<AssetClass>(holding?.assetClass ?? "stocks");
  const [notes, setNotes] = useState(holding?.notes ?? "");

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [error, setError] = useState("");

  async function handleFetchPrice() {
    if (!ticker.trim()) return;
    setIsFetchingPrice(true);
    try {
      const quote = await fetchQuote(ticker.trim().toUpperCase());
      setCurrentPrice(quote.currentPrice.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch price");
    } finally {
      setIsFetchingPrice(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      if (isEditing && holding) {
        await updateHolding(holding.id, {
          name: name.trim(),
          ticker: ticker.trim() || null,
          shares: shares ? parseFloat(shares) : null,
          costBasis: costBasis ? parseFloat(costBasis) : null,
          currentPrice: currentPrice ? parseFloat(currentPrice) : null,
          assetClass,
          notes: notes.trim() || null,
        });
      } else {
        await createHolding({
          accountId,
          name: name.trim(),
          ticker: ticker.trim() || undefined,
          shares: shares ? parseFloat(shares) : undefined,
          costBasis: costBasis ? parseFloat(costBasis) : undefined,
          currentPrice: currentPrice ? parseFloat(currentPrice) : undefined,
          assetClass,
          notes: notes.trim() || undefined,
        });
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save holding");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Holding" : "Add Holding"}</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-error">{error}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isEditing && accounts.length > 1 && (
            <div className="flex flex-col gap-1">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apple Inc., Vanguard S&P 500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label>Ticker</Label>
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL, VOO"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Shares</Label>
              <Input
                type="number"
                step="any"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label>Cost Basis (per share)</Label>
              <Input
                type="number"
                step="any"
                value={costBasis}
                onChange={(e) => setCostBasis(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Current Price</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="any"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                placeholder="0.00"
                className="flex-1"
              />
              {ticker.trim() && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleFetchPrice}
                  disabled={isFetchingPrice}
                  className="shrink-0"
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${isFetchingPrice ? "animate-spin" : ""}`} />
                  Fetch
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Asset Class</Label>
            <Select value={assetClass} onValueChange={(v) => setAssetClass(v as AssetClass)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CLASSES.map((ac) => (
                  <SelectItem key={ac} value={ac}>{ASSET_CLASS_LABELS[ac]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>

          <div className="flex gap-3 justify-end mt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? "Saving..." : isEditing ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
