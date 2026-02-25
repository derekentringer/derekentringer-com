import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  Goal,
  CreateGoalRequest,
  UpdateGoalRequest,
  GoalProgressResponse,
  GoalProgress,
} from "@derekentringer/shared/finance";
import {
  fetchGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  reorderGoals,
  fetchGoalProgress,
} from "@/api/goals.ts";
import { GoalForm } from "@/components/GoalForm.tsx";
import { GoalProgressCard } from "@/components/goals/GoalProgressCard.tsx";
import { ConfirmDialog } from "@/components/ConfirmDialog.tsx";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Info } from "lucide-react";
import { formatCurrency } from "@/lib/chartTheme";
import { AiInsightBanner } from "@/components/AiInsightBanner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-skeleton rounded w-32" />
          <div className="h-2 bg-skeleton rounded w-full" />
          <div className="h-[120px] bg-skeleton rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

function KpiInfo({ title, value, tooltip }: { title: string; value: string; tooltip: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-xs text-muted-foreground">{title}</span>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </div>
        <div className="text-lg font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function SortableGoalCard({
  progress,
  onEdit,
  onDelete,
}: {
  progress: GoalProgress;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: progress.goalId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <GoalProgressCard
        progress={progress}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={listeners}
      />
    </div>
  );
}

export function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [progressData, setProgressData] = useState<GoalProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Goal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const loadData = useCallback(async () => {
    try {
      const [goalsRes, progressRes] = await Promise.all([
        fetchGoals(),
        fetchGoalProgress({ months: 60 }),
      ]);
      setGoals(goalsRes.goals);
      setProgressData(progressRes);
      setError("");
    } catch {
      setError("Failed to load goals");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create a map of goalId -> GoalProgress
  const progressMap = useMemo(() => {
    if (!progressData) return new Map<string, GoalProgress>();
    const map = new Map<string, GoalProgress>();
    for (const gp of progressData.goals) {
      map.set(gp.goalId, gp);
    }
    return map;
  }, [progressData]);

  // Active goals sorted by sortOrder
  const activeGoals = useMemo(
    () => goals.filter((g) => g.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [goals],
  );

  const onTrackCount = useMemo(() => {
    if (!progressData) return 0;
    return progressData.goals.filter((g) => g.onTrack).length;
  }, [progressData]);

  async function handleCreate(data: CreateGoalRequest | UpdateGoalRequest) {
    await createGoal(data as CreateGoalRequest);
    setShowForm(false);
    loadData();
  }

  async function handleUpdate(data: CreateGoalRequest | UpdateGoalRequest) {
    if (!editTarget) return;
    await updateGoal(editTarget.id, data as UpdateGoalRequest);
    setEditTarget(null);
    loadData();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteGoal(deleteTarget.id);
      setDeleteTarget(null);
      loadData();
    } catch {
      // Error handled silently — PIN dialog may show
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activeGoals.findIndex((g) => g.id === active.id);
    const newIndex = activeGoals.findIndex((g) => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(activeGoals, oldIndex, newIndex);
    const order = reordered.map((g, i) => ({ id: g.id, sortOrder: i }));

    // Optimistic update
    setGoals((prev) => {
      const updated = [...prev];
      for (const item of order) {
        const goal = updated.find((g) => g.id === item.id);
        if (goal) goal.sortOrder = item.sortOrder;
      }
      return updated;
    });

    try {
      await reorderGoals({ order });
    } catch {
      loadData(); // Revert on failure
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Goals</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse space-y-2">
                  <div className="h-3 bg-skeleton rounded w-20" />
                  <div className="h-6 bg-skeleton rounded w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-8">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-destructive mb-2">{error}</p>
            <Button variant="secondary" size="sm" onClick={loadData}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Goals</h1>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Goal
        </Button>
      </div>

      <AiInsightBanner scope="goals" />

      {/* Financial Summary KPIs */}
      {progressData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiInfo
            title="Monthly Income"
            value={formatCurrency(progressData.monthlyIncome)}
            tooltip="Total monthly income from all sources"
          />
          <KpiInfo
            title="Monthly Expenses"
            value={formatCurrency(progressData.monthlyExpenses)}
            tooltip="Total monthly bills and budget amounts"
          />
          <KpiInfo
            title="Monthly Surplus"
            value={formatCurrency(progressData.monthlySurplus)}
            tooltip="Monthly income minus bills and budgets"
          />
          <KpiInfo
            title="Goals On Track"
            value={`${onTrackCount} of ${progressData.goals.length}`}
            tooltip="Goals projected to reach their target on or before the target date"
          />
        </div>
      )}

      {/* Goals list */}
      {activeGoals.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">
              No goals yet. Create your first financial goal to start tracking.
            </p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeGoals.map((g) => g.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeGoals.map((goal) => {
                const progress = progressMap.get(goal.id);
                if (!progress) return null;

                return (
                  <SortableGoalCard
                    key={goal.id}
                    progress={progress}
                    onEdit={() => setEditTarget(goal)}
                    onDelete={() => setDeleteTarget(goal)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Dialogs */}
      {showForm && (
        <GoalForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />
      )}

      {editTarget && (
        <GoalForm
          goal={editTarget}
          onSubmit={handleUpdate}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Goal"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}
    </div>
  );
}
