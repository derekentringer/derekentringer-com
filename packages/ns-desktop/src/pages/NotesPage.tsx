import { useState, useEffect, useCallback, useRef } from "react";
import type { Note } from "@derekentringer/ns-shared";
import {
  fetchNotes,
  createNote,
  updateNote,
  softDeleteNote,
} from "../lib/db.ts";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "../components/MarkdownEditor.tsx";
import { MarkdownPreview } from "../components/MarkdownPreview.tsx";
import {
  EditorToolbar,
  type ViewMode,
} from "../components/EditorToolbar.tsx";
import { NoteList } from "../components/NoteList.tsx";
import { ResizeDivider } from "../components/ResizeDivider.tsx";
import { useResizable } from "../hooks/useResizable.ts";
import { useEditorSettings, resolveAccentColor } from "../hooks/useEditorSettings.ts";

type SaveStatus = "idle" | "saving" | "saved";

export function NotesPage() {
  const { settings: editorSettings } = useEditorSettings();

  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(editorSettings.defaultViewMode);
  const [showLineNumbers, setShowLineNumbers] = useState(editorSettings.showLineNumbers);

  const editorRef = useRef<MarkdownEditorHandle>(null);
  const loadedContentRef = useRef("");
  const loadedTitleRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showError(message: string) {
    setError(message);
    setTimeout(() => setError(null), 4000);
  }

  const sidebarResize = useResizable({
    direction: "vertical",
    initialSize: 256,
    minSize: 180,
    maxSize: 480,
    storageKey: "ns-desktop-sidebar-width",
  });

  const splitResize = useResizable({
    direction: "vertical",
    initialSize: 500,
    minSize: 200,
    maxSize: 1200,
    storageKey: "ns-desktop-split-width",
  });

  // Resolve theme for editor
  const resolvedTheme = (() => {
    if (editorSettings.theme === "system") {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return editorSettings.theme;
  })();

  const accentHex = resolveAccentColor(editorSettings.accentColor, resolvedTheme);

  // Load notes on mount
  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    try {
      const result = await fetchNotes();
      setNotes(result);
    } catch (err) {
      console.error("Failed to load notes:", err);
      showError(`Failed to load notes: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  function isDirty(): boolean {
    return title !== loadedTitleRef.current || content !== loadedContentRef.current;
  }

  function selectNote(note: Note) {
    // Save current note if dirty before switching
    if (isDirty() && selectedId) {
      updateNote(selectedId, { title, content }).catch((err) =>
        console.error("Failed to save previous note:", err),
      );
    }

    loadedTitleRef.current = note.title;
    loadedContentRef.current = note.content;
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setSaveStatus("idle");
    setConfirmDelete(false);

    // Clear any pending save timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }

  const handleSave = useCallback(async () => {
    if (!selectedId || !isDirty()) return;

    setSaveStatus("saving");
    try {
      const updated = await updateNote(selectedId, { title, content });
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? updated : n)),
      );
      loadedTitleRef.current = title;
      loadedContentRef.current = content;
      setSaveStatus("saved");

      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save note:", err);
      showError("Failed to save note");
      setSaveStatus("idle");
    }
  }, [selectedId, title, content]);

  // Schedule auto-save on title/content change
  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      handleSave();
    }, editorSettings.autoSaveDelay);
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    scheduleSave();
  }

  function handleContentChange(newContent: string) {
    setContent(newContent);
    scheduleSave();
  }

  async function handleCreate() {
    try {
      const note = await createNote({ title: "Untitled" });
      setNotes((prev) => [note, ...prev]);
      selectNote(note);
      setTimeout(() => {
        const titleInput = document.querySelector<HTMLInputElement>("[data-title-input]");
        titleInput?.select();
      }, 50);
    } catch (err) {
      console.error("Failed to create note:", err);
      showError(`Failed to create note: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      await softDeleteNote(selectedId);
      setNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setSelectedId(null);
      setTitle("");
      setContent("");
      setConfirmDelete(false);
    } catch (err) {
      console.error("Failed to delete note:", err);
      showError("Failed to delete note");
    }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await softDeleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (selectedId === noteId) {
        setSelectedId(null);
        setTitle("");
        setContent("");
        loadedTitleRef.current = "";
        loadedContentRef.current = "";
      }
    } catch (err) {
      console.error("Failed to delete note:", err);
      showError("Failed to delete note");
    }
  }

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  // Note: isLoading is handled inline in the note list area

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={`bg-sidebar flex flex-col shrink-0 overflow-hidden ${sidebarResize.isDragging ? "" : "transition-[width] duration-300 ease-in-out"}`}
        style={{ width: sidebarResize.size }}
      >
        {/* Sidebar header */}
        <div className="pl-4 pr-2 py-4 flex items-center justify-between">
          <h1 className="text-lg font-normal text-foreground">NoteSync</h1>
          <button
            onClick={handleCreate}
            className="w-7 h-7 flex items-center justify-center rounded bg-primary text-primary-contrast hover:bg-primary-hover transition-colors text-lg leading-none"
            title="New note"
          >
            +
          </button>
        </div>

        {/* Note list */}
        <nav className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : notes.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No notes yet
            </div>
          ) : (
            <NoteList
              notes={notes}
              selectedId={selectedId}
              onSelect={selectNote}
              onDeleteNote={handleDeleteNote}
            />
          )}
        </nav>
      </aside>

      <ResizeDivider
        direction="vertical"
        isDragging={sidebarResize.isDragging}
        onPointerDown={sidebarResize.onPointerDown}
      />

      {/* Editor area */}
      <main className="flex-1 flex min-w-0 relative">
      <div className="flex-1 flex flex-col min-w-0">
        {selectedNote ? (
          <>
            {/* Toolbar status bar */}
            <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border shrink-0">
              <span className="text-[11px] text-muted-foreground">
                {saveStatus === "saving"
                  ? "Saving..."
                  : isDirty()
                    ? "Unsaved"
                    : "Saved"}
              </span>
              <div className="flex-1" />
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-destructive">Delete?</span>
                  <button
                    onClick={handleDelete}
                    className="px-1.5 py-0.5 rounded bg-destructive text-foreground text-[11px] hover:bg-destructive-hover transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-1.5 py-0.5 rounded border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDelete}
                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                  title="Delete"
                  aria-label="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              )}
            </div>

            {/* Title */}
            <div className="border-b border-border">
              <input
                data-title-input
                type="text"
                value={title}
                onChange={handleTitleChange}
                onFocus={(e) => {
                  if (e.target.value === "Untitled") {
                    setTitle("");
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value.trim() === "") {
                    setTitle("Untitled");
                    scheduleSave();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                    editorRef.current?.focus();
                  }
                }}
                placeholder="Note title"
                className="w-full px-4 py-3 bg-transparent text-xl text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            {/* Toolbar */}
            <EditorToolbar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onBold={() => editorRef.current?.insertBold()}
              onItalic={() => editorRef.current?.insertItalic()}
              showLineNumbers={showLineNumbers}
              onToggleLineNumbers={() => setShowLineNumbers((prev) => !prev)}
            />

            {/* Content */}
            <div className="flex-1 flex min-h-0">
              {viewMode !== "preview" && (
                <MarkdownEditor
                  ref={editorRef}
                  value={content}
                  onChange={handleContentChange}
                  onSave={handleSave}
                  showLineNumbers={showLineNumbers}
                  wordWrap={editorSettings.wordWrap}
                  tabSize={editorSettings.tabSize}
                  fontSize={editorSettings.editorFontSize}
                  theme={resolvedTheme}
                  accentColor={accentHex}
                  className={`${viewMode === "split" ? "shrink-0" : "flex-1"} overflow-auto`}
                  style={viewMode === "split" ? { width: splitResize.size } : undefined}
                />
              )}
              {viewMode === "split" && (
                <ResizeDivider
                  direction="vertical"
                  isDragging={splitResize.isDragging}
                  onPointerDown={splitResize.onPointerDown}
                />
              )}
              {viewMode !== "editor" && (
                <MarkdownPreview
                  content={content}
                  className={viewMode === "split" ? "flex-1 min-w-0 overflow-auto" : "flex-1"}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-muted-foreground">
              Select a note or create a new one
            </p>
          </div>
        )}
      </div>
      </main>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-card border border-destructive rounded-md px-4 py-3 shadow-lg flex items-center gap-3">
          <span className="text-sm text-destructive">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
