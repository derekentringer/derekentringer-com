import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

interface PdfPreviewBaseProps {
  accountName: string;
  editedDate: string;
  onDateChange: (value: string) => void;
  editedBalance: string;
  onBalanceChange: (value: string) => void;
  existingBalance: number | null;
  existingBalanceOnDate: number | null;
  updateCurrentBalance: boolean;
  onUpdateCurrentBalanceChange: (value: boolean) => void;
  rawExtraction: { balanceText: string; dateText: string };
  rawProfileExtraction?: Record<string, string>;
}

export function PdfPreviewBase({
  accountName,
  editedDate,
  onDateChange,
  editedBalance,
  onBalanceChange,
  existingBalance,
  existingBalanceOnDate,
  updateCurrentBalance,
  onUpdateCurrentBalanceChange,
  rawExtraction,
  rawProfileExtraction,
}: PdfPreviewBaseProps) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Account</span>
          <span>{accountName}</span>
        </div>

        <div className="flex justify-between items-center text-sm gap-4">
          <Label className="text-muted-foreground shrink-0">
            Statement Date
          </Label>
          <Input
            type="date"
            value={editedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-auto text-right"
          />
        </div>

        <div className="flex justify-between items-center text-sm gap-4">
          <Label className="text-muted-foreground shrink-0">
            Extracted Balance
          </Label>
          <Input
            type="number"
            step="0.01"
            value={editedBalance}
            onChange={(e) => onBalanceChange(e.target.value)}
            className="w-auto text-right"
          />
        </div>

        {existingBalance !== null && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Current Balance</span>
            <span>{formatCurrency(existingBalance)}</span>
          </div>
        )}
      </div>

      {existingBalanceOnDate !== null && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
          <p className="text-sm text-yellow-400">
            A balance of {formatCurrency(existingBalanceOnDate)} already exists
            for this account on {editedDate}. Confirming will replace the
            existing record.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-border p-3">
        <p className="text-xs text-muted-foreground mb-2">
          AI Extraction Details
        </p>
        <div className="flex flex-col gap-1 text-xs">
          <div>
            <span className="text-muted-foreground">Balance text: </span>
            <span className="text-foreground">
              {rawExtraction.balanceText}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Date text: </span>
            <span className="text-foreground">
              {rawExtraction.dateText}
            </span>
          </div>
          {rawProfileExtraction &&
            Object.entries(rawProfileExtraction).map(([key, value]) => (
              <div key={key}>
                <span className="text-muted-foreground">{key}: </span>
                <span className="text-foreground">{value}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="updateBalance"
          checked={updateCurrentBalance}
          onCheckedChange={(checked) =>
            onUpdateCurrentBalanceChange(checked === true)
          }
        />
        <Label htmlFor="updateBalance" className="text-sm cursor-pointer">
          Also update account's current balance
        </Label>
      </div>
    </>
  );
}
