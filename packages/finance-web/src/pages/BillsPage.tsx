import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  Bill,
  CreateBillRequest,
  UpdateBillRequest,
  UpcomingBillInstance,
} from "@derekentringer/shared/finance";
import { BILL_FREQUENCY_LABELS } from "@derekentringer/shared/finance";
import {
  fetchBills,
  fetchUpcomingBills,
  createBill,
  updateBill,
  deleteBill,
  markBillPaid,
  unmarkBillPaid,
} from "@/api/bills.ts";
import { BillForm } from "@/components/BillForm.tsx";
import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatCurrencyFull } from "@/lib/chartTheme";

type FilterTab = "all" | "upcoming" | "paid" | "overdue";
type SortField = "name" | "amount" | "frequency" | "nextDue";
type SortDir = "asc" | "desc";

export function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingBillInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const loadData = useCallback(async () => {
    try {
      const [billsRes, upcomingRes] = await Promise.all([
        fetchBills(),
        fetchUpcomingBills(60),
      ]);
      setBills(billsRes.bills);
      setUpcoming(upcomingRes.bills);
      setError("");
    } catch {
      setError("Failed to load bills");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const nextDueMap = useMemo(() => {
    const map = new Map<string, UpcomingBillInstance>();
    if (upcoming) {
      for (const instance of upcoming) {
        if (!map.has(instance.billId)) {
          map.set(instance.billId, instance);
        }
      }
    }
    return map;
  }, [upcoming]);

  const filteredBills = useMemo(() => {
    switch (filter) {
      case "upcoming":
        return bills.filter((b) => {
          const inst = nextDueMap.get(b.id);
          return b.isActive && inst && !inst.isPaid;
        });
      case "paid":
        return bills.filter((b) => {
          const inst = nextDueMap.get(b.id);
          return inst?.isPaid;
        });
      case "overdue":
        return bills.filter((b) => {
          const inst = nextDueMap.get(b.id);
          return inst?.isOverdue && !inst.isPaid;
        });
      default:
        return bills;
    }
  }, [bills, filter, nextDueMap]);

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

  const sortedBills = useMemo(() => {
    if (!sortField) return filteredBills;
    return [...filteredBills].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "amount":
          cmp = a.amount - b.amount;
          break;
        case "frequency":
          cmp = a.frequency.localeCompare(b.frequency);
          break;
        case "nextDue": {
          const aDate = nextDueMap.get(a.id)?.dueDate ?? "";
          const bDate = nextDueMap.get(b.id)?.dueDate ?? "";
          cmp = aDate.localeCompare(bDate);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredBills, sortField, sortDir, nextDueMap]);

  async function handleCreate(
    data: CreateBillRequest | UpdateBillRequest,
  ) {
    await createBill(data as CreateBillRequest);
    setShowForm(false);
    await loadData();
  }

  async function handleUpdate(
    data: CreateBillRequest | UpdateBillRequest,
  ) {
    if (!editBill) return;
    await updateBill(editBill.id, data as UpdateBillRequest);
    setEditBill(null);
    await loadData();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteBill(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch {
      setError("Failed to delete bill");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleTogglePaid(bill: Bill) {
    const instance = nextDueMap.get(bill.id);
    if (!instance) return;
    setPayingId(bill.id);
    try {
      if (instance.isPaid) {
        await unmarkBillPaid(bill.id, instance.dueDate);
      } else {
        await markBillPaid(bill.id, instance.dueDate);
      }
      await loadData();
    } catch {
      setError("Failed to update payment status");
    } finally {
      setPayingId(null);
    }
  }

  const FILTER_TABS: { value: FilterTab; label: string }[] = [
    { value: "all", label: "All" },
    { value: "upcoming", label: "Upcoming" },
    { value: "paid", label: "Paid" },
    { value: "overdue", label: "Overdue" },
  ];

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
        <h1 className="text-xl sm:text-2xl md:text-3xl text-foreground">Bills</h1>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Add Bill
        </Button>
      </div>
      <Card>
        <CardContent>
          {error && <p className="text-sm text-error mb-4">{error}</p>}

          <div className="mb-4">
            <TabSwitcher options={FILTER_TABS} value={filter} onChange={setFilter} size="sm" />
          </div>

          {filteredBills.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              {bills.length === 0
                ? "No bills tracked yet. Add your first recurring bill."
                : "No bills match the selected filter."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableTableHead field="name" label="Name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableTableHead field="amount" label="Amount" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <SortableTableHead field="frequency" label="Frequency" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <SortableTableHead field="nextDue" label="Next Due" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBills.map((bill) => {
                  const instance = nextDueMap.get(bill.id);
                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="font-normal">
                        {bill.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrencyFull(bill.amount)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {BILL_FREQUENCY_LABELS[bill.frequency]}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {instance
                          ? new Date(
                              instance.dueDate + "T00:00:00",
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {instance?.isOverdue && !instance.isPaid ? (
                          <Badge variant="destructive">Overdue</Badge>
                        ) : instance?.isPaid ? (
                          <Badge variant="success">Paid</Badge>
                        ) : bill.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="muted">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {instance && bill.isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary hover:text-primary-hover"
                              disabled={payingId === bill.id}
                              onClick={() => handleTogglePaid(bill)}
                            >
                              {payingId === bill.id
                                ? "..."
                                : instance.isPaid
                                  ? "Unmark"
                                  : "Mark Paid"}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary hover:text-primary-hover"
                            onClick={() => setEditBill(bill)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-error hover:text-destructive-hover"
                            onClick={() => setDeleteTarget(bill)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <BillForm
          onSubmit={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}

      {editBill && (
        <BillForm
          bill={editBill}
          onSubmit={handleUpdate}
          onClose={() => setEditBill(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Bill"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This will also delete all payment history for this bill.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}

function SortableTableHead({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className = "",
}: {
  field: SortField;
  label: string;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = sortField === field;
  const Icon = isActive
    ? sortDir === "asc" ? ArrowUp : ArrowDown
    : ArrowUpDown;

  return (
    <TableHead className={className}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${isActive ? "text-foreground" : ""}`}
        onClick={() => onSort(field)}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${isActive ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}
