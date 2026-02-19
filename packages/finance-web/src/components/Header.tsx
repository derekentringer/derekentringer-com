import { Menu, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-lg font-thin md:hidden">fin</span>
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <span className="text-sm text-muted">{user.username}</span>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
