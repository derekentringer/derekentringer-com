import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  findTables,
  updateCell,
  sortTableByColumn,
} from "../lib/tableMarkdown.ts";

interface InteractiveTableProps {
  content: string;
  onContentChange: (content: string) => void;
  tableIndex: number;
  children: React.ReactNode;
}

function SortIndicator({ direction }: { direction: "asc" | "desc" }) {
  return (
    <span className="sort-indicator" aria-label={`sorted ${direction}ending`}>
      <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
        {direction === "asc" ? (
          <path d="M4 0L8 5H0z" />
        ) : (
          <path d="M4 10L0 5h8z" />
        )}
      </svg>
    </span>
  );
}

// Strip wrapping <p> tags from inline ReactMarkdown rendering
const inlineComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
};

export function InteractiveTable({
  content,
  onContentChange,
  tableIndex,
  children,
}: InteractiveTableProps) {
  const [sortState, setSortState] = useState<{
    col: number;
    dir: "asc" | "desc";
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const table = findTables(content)[tableIndex];

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const updated = updateCell(
      content,
      tableIndex,
      editingCell.row,
      editingCell.col,
      editValue,
    );
    setEditingCell(null);
    onContentChange(updated);
  }, [editingCell, editValue, content, tableIndex, onContentChange]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const moveToCell = useCallback(
    (row: number, col: number) => {
      if (!table) return;
      const colCount = table.headers.length;
      const rowCount = table.rows.length;
      if (row < 0 || row >= rowCount) {
        setEditingCell(null);
        return;
      }
      if (col < 0) {
        if (row > 0) {
          moveToCell(row - 1, colCount - 1);
        } else {
          setEditingCell(null);
        }
        return;
      }
      if (col >= colCount) {
        if (row < rowCount - 1) {
          moveToCell(row + 1, 0);
        } else {
          setEditingCell(null);
        }
        return;
      }
      setEditingCell({ row, col });
      setEditValue(table.rows[row]?.[col] || "");
    },
    [table],
  );

  const handleHeaderClick = useCallback(
    (colIndex: number) => {
      const newDir: "asc" | "desc" =
        sortState?.col === colIndex && sortState.dir === "asc" ? "desc" : "asc";
      setSortState({ col: colIndex, dir: newDir });
      onContentChange(
        sortTableByColumn(content, tableIndex, colIndex, newDir),
      );
    },
    [sortState, content, tableIndex, onContentChange],
  );

  const handleCellDoubleClick = useCallback(
    (row: number, col: number) => {
      if (!table) return;
      setEditingCell({ row, col });
      setEditValue(table.rows[row]?.[col] || "");
    },
    [table],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!editingCell) return;
      if (e.key === "Enter") {
        e.preventDefault();
        commitEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      } else if (e.key === "Tab") {
        e.preventDefault();
        const updated = updateCell(
          content,
          tableIndex,
          editingCell.row,
          editingCell.col,
          editValue,
        );
        onContentChange(updated);

        if (e.shiftKey) {
          moveToCell(editingCell.row, editingCell.col - 1);
        } else {
          moveToCell(editingCell.row, editingCell.col + 1);
        }
      }
    },
    [
      editingCell,
      editValue,
      commitEdit,
      cancelEdit,
      content,
      tableIndex,
      onContentChange,
      moveToCell,
    ],
  );

  // Fallback: render static table if parsing fails
  if (!table) {
    return <table>{children}</table>;
  }

  return (
    <table>
      <thead>
        <tr>
          {table.headers.map((header, colIndex) => {
            const isActive = sortState?.col === colIndex;
            return (
              <th
                key={colIndex}
                className={`sortable-header cursor-pointer${isActive ? " sort-active" : ""}`}
                onClick={() => handleHeaderClick(colIndex)}
              >
                <ReactMarkdown components={inlineComponents}>
                  {header}
                </ReactMarkdown>
                {isActive && sortState && (
                  <SortIndicator direction={sortState.dir} />
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {table.headers.map((_, colIndex) => {
              const isEditing =
                editingCell?.row === rowIndex &&
                editingCell?.col === colIndex;
              const cellValue = row[colIndex] || "";

              if (isEditing) {
                return (
                  <td key={colIndex} className="editable-cell">
                    <input
                      ref={inputRef}
                      type="text"
                      className="cell-edit-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={handleKeyDown}
                    />
                  </td>
                );
              }

              return (
                <td
                  key={colIndex}
                  className="editable-cell"
                  onDoubleClick={() =>
                    handleCellDoubleClick(rowIndex, colIndex)
                  }
                >
                  <ReactMarkdown components={inlineComponents}>
                    {cellValue}
                  </ReactMarkdown>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
