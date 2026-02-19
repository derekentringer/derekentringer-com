import { useState, useEffect, useCallback, useRef } from "react";
import type {
  Account,
  LoanProfileData,
  LoanStaticData,
  InvestmentProfileData,
  SavingsProfileData,
  PdfImportPreviewResponse,
} from "@derekentringer/shared/finance";
import { AccountType } from "@derekentringer/shared/finance";
import { fetchAccounts } from "../api/accounts.ts";
import { uploadPdfPreview, confirmPdfImport } from "../api/balances.ts";
import { usePin } from "../context/PinContext.tsx";
import { PinGate } from "./PinGate.tsx";
import { PdfPreviewBase } from "./pdf-import/PdfPreviewBase.tsx";
import { LoanProfilePreview } from "./pdf-import/LoanProfilePreview.tsx";
import { InvestmentProfilePreview } from "./pdf-import/InvestmentProfilePreview.tsx";
import { SavingsProfilePreview } from "./pdf-import/SavingsProfilePreview.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface PdfImportDialogProps {
  onClose: () => void;
  onImported: () => void;
}

type Step = "upload" | "preview" | "result";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function PdfImportDialog({ onClose, onImported }: PdfImportDialogProps) {
  const { isPinVerified, pinToken } = usePin();
  const [step, setStep] = useState<Step>("upload");

  // Upload state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileSizeError, setFileSizeError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [preview, setPreview] = useState<PdfImportPreviewResponse | null>(null);
  // Editable base fields
  const [editedBalance, setEditedBalance] = useState("");
  const [editedDate, setEditedDate] = useState("");
  const [updateCurrentBalance, setUpdateCurrentBalance] = useState(true);
  const [updateInterestRate, setUpdateInterestRate] = useState(true);

  // Profile state
  const [loanProfile, setLoanProfile] = useState<LoanProfileData>({});
  const [loanStatic, setLoanStatic] = useState<LoanStaticData>({});
  const [investmentProfile, setInvestmentProfile] = useState<InvestmentProfileData>({});
  const [savingsProfile, setSavingsProfile] = useState<SavingsProfileData>({});

  // Result state
  const [result, setResult] = useState<{
    balance: number;
    date: string;
    accountUpdated: boolean;
    interestRateUpdated?: boolean;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAccounts = useCallback(async () => {
    try {
      const { accounts } = await fetchAccounts();
      setAccounts(accounts.filter((a) => a.isActive));
    } catch {
      setError("Failed to load accounts");
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFileSizeError("");
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFileSizeError("File exceeds 5MB limit");
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function handleUpload() {
    if (!file || !accountId || !pinToken) return;
    setError("");
    setIsLoading(true);

    try {
      const data = await uploadPdfPreview(accountId, file, pinToken);
      setPreview(data);
      // Pre-populate editable fields with AI-extracted values
      setEditedBalance(String(data.balance));
      setEditedDate(data.date);

      // Pre-populate profile data
      if (data.loanProfile) setLoanProfile(data.loanProfile);
      if (data.loanStatic) setLoanStatic(data.loanStatic);
      if (data.investmentProfile) setInvestmentProfile(data.investmentProfile);
      if (data.savingsProfile) setSavingsProfile(data.savingsProfile);

      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract PDF");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirm() {
    if (!pinToken || !preview) return;

    const balance = parseFloat(editedBalance);
    if (isNaN(balance)) {
      setError("Please enter a valid balance");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editedDate)) {
      setError("Please enter a valid date (YYYY-MM-DD)");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const accountType = preview.accountType;

      const res = await confirmPdfImport(
        {
          accountId,
          balance,
          date: editedDate,
          updateCurrentBalance,
          updateInterestRate:
            updateInterestRate &&
            (accountType === AccountType.Loan ||
              accountType === AccountType.HighYieldSavings ||
              accountType === AccountType.Savings)
              ? true
              : undefined,
          loanProfile:
            accountType === AccountType.Loan ? loanProfile : undefined,
          loanStatic:
            accountType === AccountType.Loan ? loanStatic : undefined,
          investmentProfile:
            accountType === AccountType.Investment
              ? investmentProfile
              : undefined,
          savingsProfile:
            accountType === AccountType.HighYieldSavings ||
            accountType === AccountType.Savings
              ? savingsProfile
              : undefined,
        },
        pinToken,
      );
      setResult(res);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save balance");
    } finally {
      setIsLoading(false);
    }
  }

  function handleBack() {
    setStep("upload");
    setPreview(null);
    setError("");
  }

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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Import PDF Statement"}
            {step === "preview" && "Preview Extraction"}
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
                      {a.name} — {a.institution}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label>PDF Statement</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-primary file:text-primary-foreground file:cursor-pointer"
              />
              {fileSizeError && (
                <p className="text-sm text-error">{fileSizeError}</p>
              )}
            </div>

            {isLoading && (
              <p className="text-sm text-muted-foreground">
                Analyzing statement with AI — this may take a few seconds.
              </p>
            )}

            <div className="flex gap-3 justify-end mt-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isLoading || !accountId || !file || !!fileSizeError}
              >
                {isLoading ? "Extracting..." : "Upload & Extract"}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="flex flex-col gap-4">
            <PdfPreviewBase
              accountName={preview.accountName}
              editedDate={editedDate}
              onDateChange={setEditedDate}
              editedBalance={editedBalance}
              onBalanceChange={setEditedBalance}
              existingBalance={preview.existingBalance}
              existingBalanceOnDate={preview.existingBalanceOnDate}
              updateCurrentBalance={updateCurrentBalance}
              onUpdateCurrentBalanceChange={setUpdateCurrentBalance}
              rawExtraction={preview.rawExtraction}
              rawProfileExtraction={preview.rawProfileExtraction}
            />

            {preview.accountType === AccountType.Loan && (
              <LoanProfilePreview
                loanProfile={loanProfile}
                onLoanProfileChange={setLoanProfile}
                loanStatic={loanStatic}
                onLoanStaticChange={setLoanStatic}
                updateInterestRate={updateInterestRate}
                onUpdateInterestRateChange={setUpdateInterestRate}
              />
            )}

            {preview.accountType === AccountType.Investment && (
              <InvestmentProfilePreview
                investmentProfile={investmentProfile}
                onInvestmentProfileChange={setInvestmentProfile}
              />
            )}

            {(preview.accountType === AccountType.HighYieldSavings ||
              preview.accountType === AccountType.Savings) && (
              <SavingsProfilePreview
                savingsProfile={savingsProfile}
                onSavingsProfileChange={setSavingsProfile}
                updateInterestRate={updateInterestRate}
                onUpdateInterestRateChange={setUpdateInterestRate}
              />
            )}

            <div className="flex gap-3 justify-end mt-2">
              <Button variant="secondary" onClick={handleBack}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={isLoading}>
                {isLoading ? "Saving..." : "Confirm Import"}
              </Button>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="flex flex-col gap-4 items-center py-8">
            <p className="text-lg">
              Balance of{" "}
              <span className="font-medium text-green-400">
                {formatCurrency(result.balance)}
              </span>{" "}
              saved for {result.date}
            </p>
            {result.accountUpdated && (
              <p className="text-sm text-muted-foreground">
                Account balance updated
              </p>
            )}
            {result.interestRateUpdated && (
              <p className="text-sm text-muted-foreground">
                Account interest rate updated
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
