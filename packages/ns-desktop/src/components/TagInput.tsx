import { useState, useRef, useEffect } from "react";

interface TagInputProps {
  tags: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
  autoFocus?: boolean;
  onBlurEmpty?: () => void;
  loading?: boolean;
}

export function TagInput({ tags, allTags, onChange, autoFocus, onBlurEmpty, loading }: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = input.trim()
    ? allTags
        .filter(
          (t) =>
            t.toLowerCase().includes(input.toLowerCase()) &&
            !tags.includes(t),
        )
        .slice(0, 5)
    : [];

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!showSuggestions) return;
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.parentElement?.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSuggestions]);

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
    setShowSuggestions(false);
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-4 py-1.5 border-b border-border relative">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-border text-muted-foreground"
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="ml-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label={`Remove tag ${tag}`}
          >
            &times;
          </button>
        </span>
      ))}
      {loading && (
        <span className="text-xs text-muted-foreground">
          <span className="inline-flex gap-0.5 mr-1.5"><span className="bounce-dot" /><span className="bounce-dot" /><span className="bounce-dot" /></span>Generating tags
        </span>
      )}
      <div className="relative flex-1 min-w-[80px]">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            if (tags.length === 0 && !input.trim() && onBlurEmpty) onBlurEmpty();
          }}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "e.g. work, meeting, project" : ""}
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5"
          aria-label="Add tag"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-md shadow-lg py-1 z-50 min-w-[120px]">
            {suggestions.map((s) => (
              <button
                key={s}
                className="w-full text-left px-3 py-1 text-xs text-foreground hover:bg-accent transition-colors cursor-pointer"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
