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
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Note } from "@derekentringer/shared/ns";

interface NoteListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onReorder: (activeId: string, overId: string) => void;
  sortByManual: boolean;
}

interface SortableNoteItemProps {
  note: Note;
  isSelected: boolean;
  onSelect: (note: Note) => void;
  sortByManual: boolean;
}

function SortableNoteItem({
  note,
  isSelected,
  onSelect,
  sortByManual,
}: SortableNoteItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id, disabled: !sortByManual });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      {sortByManual && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab px-1 text-muted-foreground hover:text-foreground text-xs select-none shrink-0"
          title="Drag to reorder"
        >
          &#x2630;
        </span>
      )}
      <button
        onClick={() => onSelect(note)}
        className={`flex-1 text-left px-2 py-2 rounded-md text-sm transition-colors truncate ${
          isSelected
            ? "bg-accent text-foreground"
            : "text-muted hover:bg-accent hover:text-foreground"
        }`}
      >
        {note.title || "Untitled"}
      </button>
    </div>
  );
}

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onReorder,
  sortByManual,
}: NoteListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={notes.map((n) => n.id)}
        strategy={verticalListSortingStrategy}
      >
        {notes.map((note) => (
          <SortableNoteItem
            key={note.id}
            note={note}
            isSelected={note.id === selectedId}
            onSelect={onSelect}
            sortByManual={sortByManual}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
