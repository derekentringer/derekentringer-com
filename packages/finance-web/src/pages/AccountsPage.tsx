import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  reorderAccounts,
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
import { Card, CardContent } from "@/components/ui/card";
import { Plus, FileUp, Star, GripVertical, Eye, EyeOff } from "lucide-react";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.Checking]: "Checking",
  [AccountType.Savings]: "Savings",
  [AccountType.HighYieldSavings]: "HYS",
  [AccountType.Credit]: "Credit",
  [AccountType.Investment]: "Investment",
  [AccountType.Loan]: "Loan",
  [AccountType.RealEstate]: "Real Estate",
  [AccountType.Other]: "Other",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

type SortField = "name" | "type" | "institution" | "balance" | "status";
type SortDir = "asc" | "desc";

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Keep a ref to the server-side order for reverting on failure
  const serverAccountsRef = useRef<Account[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const loadAccounts = useCallback(async () => {
    try {
      const { accounts } = await fetchAccounts();
      setAccounts(accounts);
      serverAccountsRef.current = accounts;
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

  async function handleToggleFavorite(account: Account) {
    try {
      await updateAccount(account.id, { isFavorite: !account.isFavorite });
      await loadAccounts();
    } catch {
      setError("Failed to update favorite status");
    }
  }

  async function handleToggleExcludeIncome(account: Account) {
    try {
      await updateAccount(account.id, { excludeFromIncomeSources: !account.excludeFromIncomeSources });
      await loadAccounts();
    } catch {
      setError("Failed to update exclude status");
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortField(null);
        setSortDir("asc");
      }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function getBalance(account: Account): number {
    return account.type === AccountType.RealEstate && account.estimatedValue != null
      ? account.estimatedValue - account.currentBalance
      : account.currentBalance;
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = accounts.findIndex((a) => a.id === active.id);
    const newIndex = accounts.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(accounts, oldIndex, newIndex);
    // Optimistic update
    setAccounts(reordered);

    const order = reordered.map((a, i) => ({ id: a.id, sortOrder: i }));
    try {
      await reorderAccounts(order);
      serverAccountsRef.current = reordered;
    } catch {
      // Revert on failure
      setAccounts(serverAccountsRef.current);
      setError("Failed to reorder accounts");
    }
  }

  const sortedAccounts = useMemo(() => {
    if (!sortField) return accounts;
    return [...accounts].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "type":
          cmp = (ACCOUNT_TYPE_LABELS[a.type] ?? a.type).localeCompare(
            ACCOUNT_TYPE_LABELS[b.type] ?? b.type,
          );
          break;
        case "institution":
          cmp = (a.institution ?? "").localeCompare(b.institution ?? "");
          break;
        case "balance":
          cmp = getBalance(a) - getBalance(b);
          break;
        case "status":
          cmp = Number(b.isActive) - Number(a.isActive);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [accounts, sortField, sortDir]);

  const isDndEnabled = sortField === null;

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-center text-muted py-8">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl md:text-3xl text-foreground">Accounts</h1>
        <div className="flex flex-col sm:flex-row gap-2">
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
      <Card>
        <CardContent>
          {error && <p className="text-sm text-error mb-4">{error}</p>}

          {accounts.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No accounts yet. Add one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {isDndEnabled && <TableHead className="w-8" />}
                  <SortableTableHead field="name" label="Name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableTableHead field="type" label="Type" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <SortableTableHead field="institution" label="Institution" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <SortableTableHead field="balance" label="Balance" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTableHead field="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              {isDndEnabled ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext
                    items={sortedAccounts.map((a) => a.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <TableBody>
                      {sortedAccounts.map((account) => (
                        <SortableRow
                          key={account.id}
                          account={account}
                          onEdit={setEditAccount}
                          onDelete={setDeleteTarget}
                          onToggleFavorite={handleToggleFavorite}
                          onToggleExcludeIncome={handleToggleExcludeIncome}
                        />
                      ))}
                    </TableBody>
                  </SortableContext>
                </DndContext>
              ) : (
                <TableBody>
                  {sortedAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-normal">{account.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {account.institution}
                      </TableCell>
                      <TableCell className="text-right">
                        {account.type === AccountType.RealEstate && account.estimatedValue != null
                          ? formatCurrency(account.estimatedValue - account.currentBalance)
                          : formatCurrency(account.currentBalance)}
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
                            className="p-1"
                            onClick={() => handleToggleFavorite(account)}
                          >
                            <Star className={cn("h-4 w-4", account.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1"
                            title={account.excludeFromIncomeSources ? "Excluded from Income vs Spending (Acct Filtered) — click to include" : "Included in Income vs Spending (Acct Filtered) — click to exclude"}
                            onClick={() => handleToggleExcludeIncome(account)}
                          >
                            {account.excludeFromIncomeSources
                              ? <EyeOff className="h-4 w-4 text-orange-400" />
                              : <Eye className="h-4 w-4 text-muted-foreground" />}
                          </Button>
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
              )}
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

function SortableRow({
  account,
  onEdit,
  onDelete,
  onToggleFavorite,
  onToggleExcludeIncome,
}: {
  account: Account;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
  onToggleFavorite: (account: Account) => void;
  onToggleExcludeIncome: (account: Account) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8 px-2">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell className="font-normal">{account.name}</TableCell>
      <TableCell className="hidden sm:table-cell">
        {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {account.institution}
      </TableCell>
      <TableCell className="text-right">
        {account.type === AccountType.RealEstate && account.estimatedValue != null
          ? formatCurrency(account.estimatedValue - account.currentBalance)
          : formatCurrency(account.currentBalance)}
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
            className="p-1"
            onClick={() => onToggleFavorite(account)}
          >
            <Star className={cn("h-4 w-4", account.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="p-1"
            title={account.excludeFromIncomeSources ? "Excluded from Income vs Spending (Acct Filtered) — click to include" : "Included in Income vs Spending (Acct Filtered) — click to exclude"}
            onClick={() => onToggleExcludeIncome(account)}
          >
            {account.excludeFromIncomeSources
              ? <EyeOff className="h-4 w-4 text-orange-400" />
              : <Eye className="h-4 w-4 text-muted-foreground" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary-hover"
            onClick={() => onEdit(account)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-error hover:text-destructive-hover"
            onClick={() => onDelete(account)}
          >
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

