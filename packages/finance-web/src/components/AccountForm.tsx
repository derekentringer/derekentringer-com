import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import {
  AccountType,
  type Account,
  type CreateAccountRequest,
  type UpdateAccountRequest,
} from "@derekentringer/shared/finance";
import styles from "./AccountForm.module.css";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.Checking]: "Checking",
  [AccountType.Savings]: "Savings",
  [AccountType.HighYieldSavings]: "High Yield Savings",
  [AccountType.Credit]: "Credit",
  [AccountType.Investment]: "Investment",
  [AccountType.Loan]: "Loan",
  [AccountType.Other]: "Other",
};

const INTEREST_RATE_TYPES = new Set([
  AccountType.HighYieldSavings,
  AccountType.Savings,
  AccountType.Loan,
]);

interface AccountFormProps {
  account?: Account | null;
  onSubmit: (data: CreateAccountRequest | UpdateAccountRequest) => Promise<void>;
  onClose: () => void;
}

export function AccountForm({ account, onSubmit, onClose }: AccountFormProps) {
  const isEdit = !!account;

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(
    account?.type ?? AccountType.Checking,
  );
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [currentBalance, setCurrentBalance] = useState(
    account?.currentBalance?.toString() ?? "",
  );
  const [accountNumber, setAccountNumber] = useState(
    account?.accountNumber ?? "",
  );
  const [interestRate, setInterestRate] = useState(
    account?.interestRate?.toString() ?? "",
  );
  const [csvParserId, setCsvParserId] = useState(account?.csvParserId ?? "");
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const showInterestRate = INTEREST_RATE_TYPES.has(type);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isEdit) {
        const data: UpdateAccountRequest = {};
        if (name !== account!.name) data.name = name;
        if (type !== account!.type) data.type = type;
        if (institution !== account!.institution) data.institution = institution;
        const balNum = parseFloat(currentBalance);
        if (balNum !== account!.currentBalance) data.currentBalance = balNum;
        const acctNum = accountNumber || null;
        if (acctNum !== (account!.accountNumber ?? null))
          data.accountNumber = acctNum;
        const rate = interestRate ? parseFloat(interestRate) : null;
        if (rate !== (account!.interestRate ?? null)) data.interestRate = rate;
        const parser = csvParserId || null;
        if (parser !== (account!.csvParserId ?? null))
          data.csvParserId = parser;
        if (isActive !== account!.isActive) data.isActive = isActive;
        await onSubmit(data);
      } else {
        const data: CreateAccountRequest = {
          name,
          type,
          institution,
          currentBalance: parseFloat(currentBalance),
        };
        if (accountNumber) data.accountNumber = accountNumber;
        if (interestRate) data.interestRate = parseFloat(interestRate);
        if (csvParserId) data.csvParserId = csvParserId;
        if (!isActive) data.isActive = false;
        await onSubmit(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>
          {isEdit ? "Edit Account" : "Add Account"}
        </h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label}>
            Name
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className={styles.label}>
            Type
            <select
              className={styles.input}
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
            >
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Institution
            <input
              className={styles.input}
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              required
            />
          </label>
          <label className={styles.label}>
            Balance
            <input
              className={styles.input}
              type="number"
              step="0.01"
              value={currentBalance}
              onChange={(e) => setCurrentBalance(e.target.value)}
              required
            />
          </label>
          <label className={styles.label}>
            Account Number
            <input
              className={styles.input}
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Optional"
            />
          </label>
          {showInterestRate && (
            <label className={styles.label}>
              Interest Rate (%)
              <input
                className={styles.input}
                type="number"
                step="0.01"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                placeholder="Optional"
              />
            </label>
          )}
          <label className={styles.label}>
            CSV Parser ID
            <input
              className={styles.input}
              type="text"
              value={csvParserId}
              onChange={(e) => setCsvParserId(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitting || !name || !institution || !currentBalance}
            >
              {isSubmitting ? "Saving..." : isEdit ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
