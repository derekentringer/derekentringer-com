import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import type {
  Category,
  CategoryRule,
  CreateCategoryRuleRequest,
  UpdateCategoryRuleRequest,
} from "@derekentringer/shared/finance";
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
import { CategoryRuleForm } from "../components/CategoryRuleForm.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Plus } from "lucide-react";

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"categories" | "rules">(
    "categories",
  );

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6">
      <div className="flex gap-2">
        <Button
          variant={activeTab === "categories" ? "default" : "secondary"}
          size="sm"
          onClick={() => setActiveTab("categories")}
        >
          Categories
        </Button>
        <Button
          variant={activeTab === "rules" ? "default" : "secondary"}
          size="sm"
          onClick={() => setActiveTab("rules")}
        >
          Category Rules
        </Button>
      </div>

      {activeTab === "categories" ? <CategoriesSection /> : <RulesSection />}
    </div>
  );
}

function CategoriesSection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  if (isLoading) {
    return <p className="text-center text-muted py-8">Loading...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="font-thin text-2xl">Categories</h2>
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
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
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

  if (isLoading) {
    return <p className="text-center text-muted py-8">Loading...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="font-thin text-2xl">Category Rules</h2>
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
              <TableRow>
                <TableHead>Pattern</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Match Type
                </TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="hidden md:table-cell">
                  Priority
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
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
