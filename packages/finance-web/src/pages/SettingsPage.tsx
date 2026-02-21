import { useState, useEffect, useCallback, useMemo } from "react";
import type { FormEvent } from "react";
import type {
  Category,
  CategoryRule,
  CreateCategoryRuleRequest,
  UpdateCategoryRuleRequest,
  IncomeSource,
} from "@derekentringer/shared/finance";
import { INCOME_SOURCE_FREQUENCY_LABELS } from "@derekentringer/shared/finance";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../api/categories.ts";
import {
  fetchCategoryRules,
  createCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
} from "../api/categoryRules.ts";
import {
  fetchIncomeSources,
  deleteIncomeSource,
} from "../api/incomeSources.ts";
import { CategoryRuleForm } from "../components/CategoryRuleForm.tsx";
import { IncomeSourceForm } from "../components/IncomeSourceForm.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { formatCurrencyFull } from "@/lib/chartTheme";

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"categories" | "rules" | "income">(
    "categories",
  );

  const TABS: { value: "categories" | "rules" | "income"; label: string }[] = [
    { value: "categories", label: "Categories" },
    { value: "rules", label: "Category Rules" },
    { value: "income", label: "Income Sources" },
  ];

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl md:text-3xl text-foreground">Settings</h1>
      </div>

      <TabSwitcher options={TABS} value={activeTab} onChange={setActiveTab} />

      {activeTab === "categories" ? (
        <CategoriesSection />
      ) : activeTab === "rules" ? (
        <RulesSection />
      ) : (
        <IncomeSourcesSection />
      )}
    </div>
  );
}

type CatSortField = "name" | "type";
type RuleSortField = "pattern" | "matchType" | "category" | "priority";
type SortDir = "asc" | "desc";

function CategoriesSection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortField, setSortField] = useState<CatSortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const loadCategories = useCallback(async () => {
    try {
      const { categories } = await fetchCategories();
      setCategories(categories);
      setError("");
    } catch {
      setError("Failed to load categories");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
      await loadCategories();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete category",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function handleSort(field: CatSortField) {
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

  const sortedCategories = useMemo(() => {
    if (!sortField) return categories;
    return [...categories].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "type":
          cmp = Number(b.isDefault) - Number(a.isDefault);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [categories, sortField, sortDir]);

  if (isLoading) {
    return <p className="text-center text-muted py-8">Loading...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl text-foreground">Categories</h2>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Add Category
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-error mb-4">{error}</p>}

        {categories.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No categories yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableTableHead<CatSortField> field="name" label="Name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableTableHead<CatSortField> field="type" label="Type" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCategories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>{cat.name}</TableCell>
                  <TableCell>
                    {cat.isDefault && (
                      <Badge variant="muted">Default</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary-hover"
                        onClick={() => setEditTarget(cat)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-error hover:text-destructive-hover"
                        disabled={cat.isDefault}
                        onClick={() => setDeleteTarget(cat)}
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

      {showAdd && (
        <CategoryNameDialog
          title="Add Category"
          onSubmit={async (name) => {
            await createCategory({ name });
            setShowAdd(false);
            await loadCategories();
          }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editTarget && (
        <CategoryNameDialog
          title="Edit Category"
          initialName={editTarget.name}
          onSubmit={async (name) => {
            await updateCategory(editTarget.id, { name });
            setEditTarget(null);
            await loadCategories();
          }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Category"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This will not affect existing transactions.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}
    </Card>
  );
}

function CategoryNameDialog({
  title,
  initialName = "",
  onSubmit,
  onClose,
}: {
  title: string;
  initialName?: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-error text-center">{error}</p>}
          <div className="flex gap-3 justify-end mt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RulesSection() {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<CategoryRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRule | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortField, setSortField] = useState<RuleSortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const loadData = useCallback(async () => {
    try {
      const [rulesRes, catsRes] = await Promise.all([
        fetchCategoryRules(),
        fetchCategories(),
      ]);
      setRules(rulesRes.categoryRules);
      setCategories(catsRes.categories);
      setError("");
    } catch {
      setError("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCategoryRule(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch {
      setError("Failed to delete rule");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleSort(field: RuleSortField) {
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

  const sortedRules = useMemo(() => {
    if (!sortField) return rules;
    return [...rules].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "pattern":
          cmp = a.pattern.localeCompare(b.pattern);
          break;
        case "matchType":
          cmp = a.matchType.localeCompare(b.matchType);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "priority":
          cmp = a.priority - b.priority;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rules, sortField, sortDir]);

  if (isLoading) {
    return <p className="text-center text-muted py-8">Loading...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl text-foreground">Category Rules</h2>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Add Rule
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-error mb-4">{error}</p>}

        {rules.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No category rules yet. Add rules to auto-categorize imported
            transactions.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableTableHead<RuleSortField> field="pattern" label="Pattern" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableTableHead<RuleSortField> field="matchType" label="Match Type" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                <SortableTableHead<RuleSortField> field="category" label="Category" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableTableHead<RuleSortField> field="priority" label="Priority" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono text-sm">
                    {rule.pattern}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="muted">{rule.matchType}</Badge>
                  </TableCell>
                  <TableCell>{rule.category}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {rule.priority}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary-hover"
                        onClick={() => setEditTarget(rule)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-error hover:text-destructive-hover"
                        onClick={() => setDeleteTarget(rule)}
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

      {showAdd && (
        <CategoryRuleForm
          categories={categories}
          onSubmit={async (data: CreateCategoryRuleRequest | UpdateCategoryRuleRequest, options: { apply: boolean }) => {
            const res = await createCategoryRule(data as CreateCategoryRuleRequest, options);
            if (!options.apply) {
              setShowAdd(false);
            }
            await loadData();
            return res.appliedCount;
          }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editTarget && (
        <CategoryRuleForm
          rule={editTarget}
          categories={categories}
          onSubmit={async (data: CreateCategoryRuleRequest | UpdateCategoryRuleRequest, options: { apply: boolean }) => {
            const res = await updateCategoryRule(editTarget.id, data as UpdateCategoryRuleRequest, options);
            if (!options.apply) {
              setEditTarget(null);
            }
            await loadData();
            return res.appliedCount;
          }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Rule"
          message={`Are you sure you want to delete the rule "${deleteTarget.pattern}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}
    </Card>
  );
}

function IncomeSourcesSection() {
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<IncomeSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IncomeSource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadSources = useCallback(async () => {
    try {
      const { incomeSources } = await fetchIncomeSources();
      setSources(incomeSources);
      setError("");
    } catch {
      setError("Failed to load income sources");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteIncomeSource(deleteTarget.id);
      setDeleteTarget(null);
      await loadSources();
    } catch {
      setError("Failed to delete income source");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleSaved() {
    setShowAdd(false);
    setEditTarget(null);
    loadSources();
  }

  if (isLoading) {
    return <p className="text-center text-muted py-8">Loading...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl text-foreground">Income Sources</h2>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Add Income Source
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-error mb-4">{error}</p>}

        {sources.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No income sources yet. Add income sources to improve projection
            accuracy.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="hidden sm:table-cell">Frequency</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>{source.name}</TableCell>
                  <TableCell className="text-success">
                    {formatCurrencyFull(source.amount)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline">
                      {INCOME_SOURCE_FREQUENCY_LABELS[source.frequency]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={source.isActive ? "muted" : "outline"}>
                      {source.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setEditTarget(source)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-error hover:text-destructive-hover"
                        onClick={() => setDeleteTarget(source)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {(showAdd || editTarget) && (
        <IncomeSourceForm
          open={showAdd || !!editTarget}
          onClose={() => {
            setShowAdd(false);
            setEditTarget(null);
          }}
          onSaved={handleSaved}
          incomeSource={editTarget ?? undefined}
          existingNames={sources.map((s) => s.name)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Income Source"
          message={`Are you sure you want to delete "${deleteTarget.name}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}
    </Card>
  );
}

function SortableTableHead<T extends string>({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className = "",
}: {
  field: T;
  label: string;
  sortField: T | null;
  sortDir: SortDir;
  onSort: (field: T) => void;
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
