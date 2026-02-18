import { useState, useEffect, useCallback } from "react";
import type {
  Account,
  CreateAccountRequest,
  UpdateAccountRequest,
} from "@derekentringer/shared/finance";
import { AccountType } from "@derekentringer/shared/finance";
import {
  fetchAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../api/accounts.ts";
import { AccountForm } from "../components/AccountForm.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import styles from "./AccountsPage.module.css";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.Checking]: "Checking",
  [AccountType.Savings]: "Savings",
  [AccountType.HighYieldSavings]: "HYS",
  [AccountType.Credit]: "Credit",
  [AccountType.Investment]: "Investment",
  [AccountType.Loan]: "Loan",
  [AccountType.Other]: "Other",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const { accounts } = await fetchAccounts();
      setAccounts(accounts);
      setError("");
    } catch {
      setError("Failed to load accounts");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  async function handleCreate(data: CreateAccountRequest | UpdateAccountRequest) {
    await createAccount(data as CreateAccountRequest);
    setShowForm(false);
    await loadAccounts();
  }

  async function handleUpdate(data: CreateAccountRequest | UpdateAccountRequest) {
    if (!editAccount) return;
    await updateAccount(editAccount.id, data as UpdateAccountRequest);
    setEditAccount(null);
    await loadAccounts();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteAccount(deleteTarget.id);
      setDeleteTarget(null);
      await loadAccounts();
    } catch {
      setError("Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <p className={styles.loading}>Loading...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Accounts</h1>
        <button
          className={styles.addButton}
          onClick={() => setShowForm(true)}
        >
          Add Account
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {accounts.length === 0 ? (
        <p className={styles.empty}>No accounts yet. Add one to get started.</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Institution</th>
                <th className={styles.alignRight}>Balance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{ACCOUNT_TYPE_LABELS[account.type] ?? account.type}</td>
                  <td>{account.institution}</td>
                  <td className={styles.alignRight}>
                    {formatCurrency(account.currentBalance)}
                  </td>
                  <td>
                    <span
                      className={
                        account.isActive ? styles.active : styles.inactive
                      }
                    >
                      {account.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className={styles.actions}>
                    <button
                      className={styles.actionButton}
                      onClick={() => setEditAccount(account)}
                    >
                      Edit
                    </button>
                    <button
                      className={styles.deleteButton}
                      onClick={() => setDeleteTarget(account)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <AccountForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}

      {editAccount && (
        <AccountForm
          account={editAccount}
          onSubmit={handleUpdate}
          onClose={() => setEditAccount(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Account"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This will also delete all associated transactions and balances.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}
