import { useState, useEffect, useCallback, useRef } from "react";
import type { Account, Category, ParsedTransaction, CsvParserId } from "@derekentringer/shared/finance";
import { CSV_PARSER_LABELS } from "@derekentringer/shared/finance";
import { fetchAccounts } from "../api/accounts.ts";
import { fetchCategories } from "../api/categories.ts";
import { uploadCsvPreview, confirmImport } from "../api/transactions.ts";
import { usePin } from "../context/PinContext.tsx";
import { PinGate } from "./PinGate.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface CsvImportDialogProps {
  onClose: () => void;
  onImported: () => void;
}

type Step = "upload" | "preview" | "result";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CsvImportDialog({ onClose, onImported }: CsvImportDialogProps) {
  const { isPinVerified, pinToken } = usePin();
  const [step, setStep] = useState<Step>("upload");

  // Upload state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState("");
  const [parserOverride, setParserOverride] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewRows, setPreviewRows] = useState<
    Array<ParsedTransaction & { included: boolean; editedCategory: string | null }>
  >([]);
  const [previewSummary, setPreviewSummary] = useState({
    totalRows: 0,
    duplicateCount: 0,
    categorizedCount: 0,
  });

  // Result state
  const [result, setResult] = useState({ imported: 0, skipped: 0 });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [accts, cats] = await Promise.all([
        fetchAccounts(),
        fetchCategories(),
      ]);
      setAccounts(accts.accounts.filter((a) => a.isActive));
      setCategories(cats.categories);
    } catch {
      setError("Failed to load accounts");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleUpload() {
    if (!file || !accountId || !pinToken) return;
    setError("");
    setIsLoading(true);

    try {
      const parserId = parserOverride || undefined;
      const preview = await uploadCsvPreview(
        accountId,
        file,
        pinToken,
        parserId,
      );

      setPreviewRows(
        preview.transactions.map((t) => ({
          ...t,
          included: !t.isDuplicate,
          editedCategory: t.category,
        })),
      );
      setPreviewSummary({
        totalRows: preview.totalRows,
        duplicateCount: preview.duplicateCount,
        categorizedCount: preview.categorizedCount,
      });
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview CSV");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirm() {
    if (!pinToken) return;
    setError("");
    setIsLoading(true);

    try {
      const selected = previewRows
        .filter((r) => r.included)
        .map((r) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          category: r.editedCategory,
          dedupeHash: r.dedupeHash,
        }));

      const res = await confirmImport(
        { accountId, transactions: selected },
        pinToken,
      );
      setResult(res);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleRow(index: number) {
    setPreviewRows((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, included: !r.included } : r,
      ),
    );
  }

  function updateRowCategory(index: number, cat: string | null) {
    setPreviewRows((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, editedCategory: cat } : r,
      ),
    );
  }

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const includedCount = previewRows.filter((r) => r.included).length;

  if (!isPinVerified) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md">
          <PinGate>
            <div />
          </PinGate>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Import CSV"}
            {step === "preview" && "Preview Import"}
            {step === "result" && "Import Complete"}
          </DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-error">{error}</p>}

        {step === "upload" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.csvParserId ? ` (${CSV_PARSER_LABELS[a.csvParserId as CsvParserId] ?? a.csvParserId})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label>Parser Override (optional)</Label>
              <Select
                value={parserOverride}
                onValueChange={(v) => setParserOverride(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Use account default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use account default</SelectItem>
                  {Object.entries(CSV_PARSER_LABELS).map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label>CSV File</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-primary file:text-primary-foreground file:cursor-pointer"
              />
            </div>

            {selectedAccount && !selectedAccount.csvParserId && !parserOverride && (
              <p className="text-sm text-yellow-400">
                This account has no default CSV parser. Please select a parser
                override above.
              </p>
            )}

            <div className="flex gap-3 justify-end mt-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={
                  isLoading ||
                  !accountId ||
                  !file ||
                  (!selectedAccount?.csvParserId && !parserOverride)
                }
              >
                {isLoading ? "Uploading..." : "Upload & Preview"}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span>{previewSummary.totalRows} rows parsed</span>
              <span>{previewSummary.duplicateCount} duplicates</span>
              <span>{previewSummary.categorizedCount} auto-categorized</span>
              <span className="text-foreground font-medium">
                {includedCount} selected for import
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow
                      key={i}
                      className={row.isDuplicate ? "opacity-50" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={row.included}
                          onCheckedChange={() => toggleRow(i)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.date)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {row.description}
                      </TableCell>
                      <TableCell
                        className={`text-right whitespace-nowrap ${row.amount >= 0 ? "text-green-400" : ""}`}
                      >
                        {formatCurrency(row.amount)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.editedCategory ?? "__none__"}
                          onValueChange={(v) =>
                            updateRowCategory(i, v === "__none__" ? null : v)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs w-[140px]">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.name}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {row.isDuplicate && (
                          <Badge variant="muted">Duplicate</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isLoading || includedCount === 0}
              >
                {isLoading
                  ? "Importing..."
                  : `Import ${includedCount} Transaction${includedCount !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="flex flex-col gap-4 items-center py-8">
            <p className="text-lg">
              Imported{" "}
              <span className="font-medium text-green-400">
                {result.imported}
              </span>{" "}
              transaction{result.imported !== 1 ? "s" : ""}
            </p>
            {result.skipped > 0 && (
              <p className="text-sm text-muted-foreground">
                {result.skipped} skipped (duplicates)
              </p>
            )}
            <Button onClick={onImported} className="mt-4">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
