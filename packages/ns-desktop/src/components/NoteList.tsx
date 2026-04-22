import { useState, useEffect, useRef, useMemo } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Note, NoteSearchResult } from "@derekentringer/ns-shared";
import type { ExportFormat } from "../lib/importExport.ts";
import type { LocalFileStatus } from "../lib/localFileService.ts";
import { stripMarkdown } from "../lib/stripMarkdown.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { SearchSnippet } from "./SearchSnippet.tsx";

interface NoteListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onDoubleClick?: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  onExportNote?: (noteId: string, format: ExportFormat) => void;
  onToggleFavorite?: (noteId: string, favorite: boolean) => void;
  searchResults?: NoteSearchResult[] | null;
  localFileStatuses?: Map<string, LocalFileStatus>;
  locallyHostedNoteIds?: Set<string>;
  onUnlinkLocalFile?: (noteId: string) => void;
  onSaveToFile?: (noteId: string) => void;
  onUseLocalVersion?: (noteId: string) => void;
  onViewDiff?: (noteId: string) => void;
}

interface ContextMenuState {
  noteId: string;
  x: number;
  y: number;
}

interface SortableNoteItemProps {
  note: Note;
  isSelected: boolean;
  onSelect: (note: Note) => void;
  onDoubleClick?: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  onExportNote?: (noteId: string, format: ExportFormat) => void;
  onToggleFavorite?: (noteId: string, favorite: boolean) => void;
  contextMenu: ContextMenuState | null;
  onContextMenuOpen: (noteId: string, x: number, y: number) => void;
  onContextMenuClose: () => void;
  onDeleteClick: (noteId: string) => void;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  localFileStatus?: LocalFileStatus;
  hostedLocally?: boolean;
  onUnlinkLocalFile?: (noteId: string) => void;
  onSaveToFile?: (noteId: string) => void;
  onUseLocalVersion?: (noteId: string) => void;
  onViewDiff?: (noteId: string) => void;
}

function LocalFileIndicator({ hostedLocally }: { hostedLocally?: boolean }) {
  return (
    <span
      className={`shrink-0 mr-1 ${hostedLocally ? "text-primary" : "text-muted-foreground"}`}
      title={hostedLocally ? "Managed locally on this device" : "Managed locally on another device"}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    </span>
  );
}

function SortableNoteItem({
  note,
  isSelected,
  onSelect,
  onDoubleClick,
  onDeleteNote,
  onExportNote,
  onToggleFavorite,
  contextMenu,
  onContextMenuOpen,
  onContextMenuClose,
  onDeleteClick,
  contextMenuRef,
  localFileStatus,
  hostedLocally,
  onUnlinkLocalFile,
  onSaveToFile,
  onUseLocalVersion,
  onViewDiff,
}: SortableNoteItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });

  const searchNote = note as NoteSearchResult;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const snippet = useMemo(() => {
    if (searchNote.headline) return null;
    if (!note.content) return null;
    return stripMarkdown(note.content, 80);
  }, [note.content, searchNote.headline]);

  const relativeDate = useMemo(() => {
    const date = new Date(note.updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [note.updatedAt]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-start relative mb-px"
    >
      <button
        onClick={() => onSelect(note)}
        onDoubleClick={(e) => { e.preventDefault(); onDoubleClick?.(note); }}
        onContextMenu={(e) => {
          if (!onDeleteNote && !onExportNote && !onToggleFavorite) return;
          e.preventDefault();
          onContextMenuOpen(note.id, e.clientX, e.clientY);
        }}
        className={`flex-1 text-left px-2 py-1.5 rounded-md overflow-hidden transition-colors cursor-pointer ${
          isSelected
            ? "bg-accent"
            : "hover:bg-accent"
        }`}
      >
        {/* Title row */}
        <span className="flex items-center gap-1 overflow-hidden">
          {note.favorite && <span className="text-[10px] text-primary shrink-0">★</span>}
          {note.isLocalFile && <LocalFileIndicator hostedLocally={hostedLocally} />}
          <span className={`text-sm font-medium truncate ${isSelected ? "text-foreground" : "text-foreground/70"}`}>{note.title || "Untitled"}</span>
        </span>
        {/* Content preview */}
        {searchNote.headline ? (
          <SearchSnippet headline={searchNote.headline} />
        ) : snippet ? (
          <p className="text-xs text-foreground/45 truncate mt-0.5">{snippet}</p>
        ) : null}
        {/* Metadata row */}
        <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
          <span className="text-[10px] text-muted-foreground shrink-0">{relativeDate}</span>
          {note.tags && note.tags.length > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground">·</span>
              {note.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="text-[10px] px-1 py-0 rounded bg-primary/15 text-primary/70 truncate max-w-[60px]">{tag}</span>
              ))}
              {note.tags.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{note.tags.length - 2}</span>
              )}
            </>
          )}
        </div>
      </button>
      {contextMenu?.noteId === note.id && (onDeleteNote || onExportNote || onToggleFavorite) && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 py-1 bg-card border border-border rounded-md shadow-lg inline-flex flex-col"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onExportNote && (
            <>
              <button
                onClick={() => {
                  onExportNote(note.id, "md");
                  onContextMenuClose();
                }}
                className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Export as .md
              </button>
              <button
                onClick={() => {
                  onExportNote(note.id, "txt");
                  onContextMenuClose();
                }}
                className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Export as .txt
              </button>
              <button
                onClick={() => {
                  onExportNote(note.id, "pdf");
                  onContextMenuClose();
                }}
                className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Export as .pdf
              </button>
            </>
          )}
          {onToggleFavorite && (
            <button
              onClick={() => {
                onToggleFavorite(note.id, !note.favorite);
                onContextMenuClose();
              }}
              className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              {note.favorite ? "Unfavorite" : "Favorite"}
            </button>
          )}
          {note.isLocalFile && onUnlinkLocalFile && (
            <button
              onClick={() => {
                onUnlinkLocalFile(note.id);
                onContextMenuClose();
              }}
              className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Stop Managing Locally
            </button>
          )}
          {onDeleteNote && (
            <button
              onClick={() => onDeleteClick(note.id)}
              className="w-full text-left px-3 py-1 text-xs text-destructive hover:bg-accent transition-colors cursor-pointer"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onDoubleClick,
  onDeleteNote,
  onExportNote,
  onToggleFavorite,
  searchResults,
  localFileStatuses,
  locallyHostedNoteIds,
  onUnlinkLocalFile,
  onSaveToFile,
  onUseLocalVersion,
  onViewDiff,
}: NoteListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const displayNotes = searchResults ?? notes;

  useEffect(() => {
    if (!contextMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenu]);

  function handleDeleteClick(noteId: string) {
    setPendingDeleteId(noteId);
    setContextMenu(null);
  }

  const pendingNote = pendingDeleteId ? displayNotes.find((n) => n.id === pendingDeleteId) : null;

  return (
    <>
      <SortableContext
        items={displayNotes.map((n) => n.id)}
        strategy={verticalListSortingStrategy}
      >
        {displayNotes.map((note) => (
          <SortableNoteItem
            key={note.id}
            note={note}
            isSelected={note.id === selectedId}
            onSelect={onSelect}
            onDoubleClick={onDoubleClick}
            onDeleteNote={onDeleteNote}
            onExportNote={onExportNote}
            onToggleFavorite={onToggleFavorite}
            contextMenu={contextMenu}
            onContextMenuOpen={(noteId, x, y) => setContextMenu({ noteId, x, y })}
            onContextMenuClose={() => setContextMenu(null)}
            onDeleteClick={handleDeleteClick}
            contextMenuRef={contextMenuRef}
            localFileStatus={localFileStatuses?.get(note.id)}
            hostedLocally={locallyHostedNoteIds?.has(note.id)}
            onUnlinkLocalFile={onUnlinkLocalFile}
            onSaveToFile={onSaveToFile}
            onUseLocalVersion={onUseLocalVersion}
            onViewDiff={onViewDiff}
          />
        ))}
      </SortableContext>

      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete Note"
          message={pendingNote?.title || "Untitled"}
          onConfirm={() => {
            onDeleteNote?.(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </>
  );
}
