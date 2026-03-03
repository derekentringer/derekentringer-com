import type { DebtAccountSummary } from "@derekentringer/shared/finance";
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
import { GripVertical } from "lucide-react";
import { formatCurrency } from "@/lib/chartTheme";

interface DebtPriorityListProps {
  accounts: DebtAccountSummary[];
  order: string[];
  onOrderChange: (order: string[]) => void;
}

function SortableDebtItem({ account }: { account: DebtAccountSummary }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.accountId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 border border-border rounded-lg bg-card"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{account.name}</p>
        <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
          <span>{formatCurrency(account.currentBalance)}</span>
          <span>{account.interestRate}% APR</span>
          <span>{formatCurrency(account.minimumPayment)}/mo min</span>
        </div>
      </div>
    </div>
  );
}

export function DebtPriorityList({ accounts, order, onOrderChange }: DebtPriorityListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // Build ordered accounts list based on the current order
  const orderedAccounts = order
    .map((id) => accounts.find((a) => a.accountId === id))
    .filter((a): a is DebtAccountSummary => a !== undefined);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    onOrderChange(arrayMove(order, oldIndex, newIndex));
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Drag to reorder. Debts at the top receive extra payments first.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext
          items={order}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {orderedAccounts.map((account) => (
              <SortableDebtItem key={account.accountId} account={account} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
