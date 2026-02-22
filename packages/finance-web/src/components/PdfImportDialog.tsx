import { useState, useEffect, useCallback, useRef } from "react";
import type {
  Account,
  LoanProfileData,
  LoanStaticData,
  InvestmentProfileData,
  SavingsProfileData,
  CreditProfileData,
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
import { CreditProfilePreview } from "./pdf-import/CreditProfilePreview.tsx";
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
  const [files, setFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [fileSizeError, setFileSizeError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Completed results for multi-file tracking
  const [completedResults, setCompletedResults] = useState<
    Array<{ fileName: string; balance: number; date: string; accountUpdated: boolean; interestRateUpdated?: boolean; replaced?: boolean }>
  >([]);
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);

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
  const [creditProfile, setCreditProfile] = useState<CreditProfileData>({});

  // Result state
  const [result, setResult] = useState<{
    balance: number;
    date: string;
    accountUpdated: boolean;
    interestRateUpdated?: boolean;
    replaced?: boolean;
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
    setFileSizeError("");
    if (!e.target.files || e.target.files.length === 0) {
      setFiles([]);
      return;
    }
    const selected = Array.from(e.target.files);
    const oversized = selected.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      setFileSizeError(`"${oversized.name}" exceeds 5MB limit`);
      setFiles([]);
      return;
    }
    setFiles(selected);
    setCurrentFileIndex(0);
    setCompletedResults([]);
  }

  function resetPreviewState() {
    setPreview(null);
    setEditedBalance("");
    setEditedDate("");
    setUpdateCurrentBalance(true);
    setUpdateInterestRate(true);
    setLoanProfile({});
    setLoanStatic({});
    setInvestmentProfile({});
    setSavingsProfile({});
    setCreditProfile({});
    setError("");
  }

  async function uploadCurrentFile() {
    const file = files[currentFileIndex];
    if (!file || !accountId || !pinToken) return;
    setError("");
    setIsLoading(true);

    try {
      const data = await uploadPdfPreview(accountId, file, pinToken);
      setPreview(data);
      setEditedBalance(String(data.balance));
      setEditedDate(data.date);

      if (data.loanProfile) setLoanProfile(data.loanProfile);
      if (data.loanStatic) setLoanStatic(data.loanStatic);
      if (data.investmentProfile) setInvestmentProfile(data.investmentProfile);
      if (data.savingsProfile) setSavingsProfile(data.savingsProfile);
      if (data.creditProfile) setCreditProfile(data.creditProfile);

      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract PDF");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpload() {
    await uploadCurrentFile();
  }

  /** Advance to the next file in the queue, or show results if done. */
  async function advanceToNextFile() {
    if (currentFileIndex >= files.length - 1) {
      // No more files — show results
      setResult(completedResults[completedResults.length - 1] ?? null);
      setStep("result");
      return;
    }

    const nextIndex = currentFileIndex + 1;
    setCurrentFileIndex(nextIndex);
    resetPreviewState();
    setIsLoading(true);

    const nextFile = files[nextIndex];
    try {
      const data = await uploadPdfPreview(accountId, nextFile, pinToken!);
      setPreview(data);
      setEditedBalance(String(data.balance));
      setEditedDate(data.date);
      if (data.loanProfile) setLoanProfile(data.loanProfile);
      if (data.loanStatic) setLoanStatic(data.loanStatic);
      if (data.investmentProfile) setInvestmentProfile(data.investmentProfile);
      if (data.savingsProfile) setSavingsProfile(data.savingsProfile);
      if (data.creditProfile) setCreditProfile(data.creditProfile);
    } catch (err) {
      // Extraction failed — show retry/skip dialog
      setError(err instanceof Error ? err.message : "Failed to extract PDF");
    }
    setIsLoading(false);
    setStep("preview");
  }

  async function handleSkip() {
    setSkippedFiles((prev) => [...prev, files[currentFileIndex].name]);
    await advanceToNextFile();
  }

  async function handleRetryExtraction() {
    await uploadCurrentFile();
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
              accountType === AccountType.RealEstate ||
              accountType === AccountType.HighYieldSavings ||
              accountType === AccountType.Savings)
              ? true
              : undefined,
          loanProfile:
            accountType === AccountType.Loan || accountType === AccountType.RealEstate
              ? loanProfile
              : undefined,
          loanStatic:
            accountType === AccountType.Loan || accountType === AccountType.RealEstate
              ? loanStatic
              : undefined,
          investmentProfile:
            accountType === AccountType.Investment
              ? investmentProfile
              : undefined,
          savingsProfile:
            accountType === AccountType.HighYieldSavings ||
            accountType === AccountType.Savings
              ? savingsProfile
              : undefined,
          creditProfile:
            accountType === AccountType.Credit
              ? creditProfile
              : undefined,
        },
        pinToken,
      );

      setCompletedResults((prev) => [...prev, { ...res, fileName: files[currentFileIndex].name }]);
      setIsLoading(false);
      await advanceToNextFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save balance");
      setIsLoading(false);
    }
  }

  function handleBack() {
    setStep("upload");
    resetPreviewState();
    setCurrentFileIndex(0);
    setCompletedResults([]);
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
            {step === "upload" && (files.length > 1 ? "Import PDF Statements" : "Import PDF Statement")}
            {step === "preview" && (
              files.length > 1
                ? `Preview Extraction — Statement ${currentFileIndex + 1} of ${files.length}`
                : "Preview Extraction"
            )}
            {step === "result" && (
              skippedFiles.length > 0
                ? `Import Complete — ${skippedFiles.length} Failed`
                : "Import Complete"
            )}
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
              <Label>PDF Statements</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileChange}
                className="text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-primary file:text-primary-foreground file:cursor-pointer"
              />
              {files.length > 1 && (
                <p className="text-sm text-muted-foreground">
                  {files.length} files selected
                </p>
              )}
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
                disabled={isLoading || !accountId || files.length === 0 || !!fileSizeError}
              >
                {isLoading ? "Extracting..." : "Upload & Extract"}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && !preview && isLoading && (
          <div className="flex flex-col gap-4 items-center py-8">
            <p className="text-sm text-muted-foreground">
              Analyzing statement with AI — this may take a few seconds.
            </p>
          </div>
        )}

        {step === "preview" && !preview && !isLoading && (
          <div className="flex flex-col gap-4 items-center py-8">
            <p className="text-sm text-muted-foreground">
              Failed to extract "{files[currentFileIndex]?.name}"
            </p>
            <div className="flex gap-3 mt-2">
              <Button variant="secondary" onClick={handleBack}>
                Back
              </Button>
              <Button variant="secondary" onClick={handleRetryExtraction} disabled={isLoading}>
                Retry
              </Button>
              {files.length > 1 && (
                <Button onClick={handleSkip}>
                  {currentFileIndex < files.length - 1 ? "Skip & Next" : "Skip & Finish"}
                </Button>
              )}
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

            {(preview.accountType === AccountType.Loan || preview.accountType === AccountType.RealEstate) && (
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

            {preview.accountType === AccountType.Credit && (
              <CreditProfilePreview
                creditProfile={creditProfile}
                onCreditProfileChange={setCreditProfile}
              />
            )}

            <div className="flex gap-3 justify-end mt-2">
              <Button variant="secondary" onClick={handleBack}>
                Back
              </Button>
              {files.length > 1 && (
                <Button variant="secondary" onClick={handleSkip} disabled={isLoading}>
                  Skip
                </Button>
              )}
              <Button onClick={handleConfirm} disabled={isLoading}>
                {isLoading
                  ? "Saving..."
                  : files.length > 1 && currentFileIndex < files.length - 1
                    ? `Confirm & Next (${currentFileIndex + 1}/${files.length})`
                    : "Confirm Import"}
              </Button>
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="flex flex-col gap-4 items-center py-8">
            {completedResults.length === 0 && skippedFiles.length > 0 ? (
              <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 w-full max-w-sm">
                <p className="text-sm text-yellow-400 font-medium">
                  All {skippedFiles.length} statement{skippedFiles.length !== 1 ? "s" : ""} failed to extract
                </p>
                <p className="text-xs text-yellow-400/80 mt-1">
                  {skippedFiles.join(", ")}
                </p>
              </div>
            ) : completedResults.length <= 1 && skippedFiles.length === 0 && result ? (
              <>
                <p className="text-lg">
                  Balance of{" "}
                  <span className="font-medium text-green-400">
                    {formatCurrency(result.balance)}
                  </span>{" "}
                  {result.replaced ? "replaced" : "saved"} for {result.date}
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
              </>
            ) : (
              <>
                <p className="text-lg font-medium">
                  {completedResults.length} statement{completedResults.length !== 1 ? "s" : ""} imported
                </p>
                <div className="flex flex-col gap-2 w-full max-w-sm">
                  {completedResults.map((r, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center text-sm text-muted-foreground border-b border-border pb-1"
                    >
                      <span>{r.date}{r.replaced ? " (replaced)" : ""}</span>
                      <span className="text-green-400 font-medium">
                        {formatCurrency(r.balance)}
                      </span>
                    </div>
                  ))}
                </div>
                {skippedFiles.length > 0 && (
                  <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 w-full max-w-sm">
                    <p className="text-sm text-yellow-400 font-medium">
                      {skippedFiles.length} failed to extract
                    </p>
                    <p className="text-xs text-yellow-400/80 mt-1">
                      {skippedFiles.join(", ")}
                    </p>
                  </div>
                )}
              </>
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
