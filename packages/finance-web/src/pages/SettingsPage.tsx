import { Settings } from "lucide-react";

export function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <Settings className="h-16 w-16 text-muted-foreground" />
      <h1 className="font-thin text-3xl">Settings</h1>
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  );
}
