export function App() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <svg
          viewBox="0 0 512 512"
          xmlns="http://www.w3.org/2000/svg"
          className="h-20 w-20"
        >
          <rect width="512" height="512" rx="96" fill="#d4e157" />
          <rect x="228" y="128" width="56" height="256" rx="28" fill="#0f1117" />
          <rect x="128" y="228" width="256" height="56" rx="28" fill="#0f1117" />
        </svg>
        <h1 className="text-2xl font-thin tracking-widest text-foreground">
          NoteSync
        </h1>
        <p className="text-sm text-muted">Desktop app — scaffolding complete</p>
      </div>
    </div>
  );
}
