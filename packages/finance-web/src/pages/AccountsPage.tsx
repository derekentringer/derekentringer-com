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
import { PdfImportDialog } from "../components/PdfImportDialog.tsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, FileUp } from "lucide-react";

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
  const [showPdfImport, setShowPdfImport] = useState(false);

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
      <div className="p-4 md:p-8">
        <p className="text-center text-muted py-8">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h1 className="font-thin text-3xl">Accounts</h1>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowPdfImport(true)}
              >
                <FileUp className="h-4 w-4" />
                Import Statement
              </Button>
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />
                Add Account
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-error mb-4">{error}</p>}

          {accounts.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No accounts yet. Add one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Institution</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-normal">{account.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {account.institution}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(account.currentBalance)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={account.isActive ? "success" : "muted"}>
                        {account.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:text-primary-hover"
                          onClick={() => setEditAccount(account)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-error hover:text-destructive-hover"
                          onClick={() => setDeleteTarget(account)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

      {showPdfImport && (
        <PdfImportDialog
          onClose={() => setShowPdfImport(false)}
          onImported={() => {
            setShowPdfImport(false);
            loadAccounts();
          }}
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
