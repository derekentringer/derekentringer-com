interface OnlineStatusIndicatorProps {
  isOnline: boolean;
  pendingCount: number;
  lastSyncedAt: Date | null;
}

export function OnlineStatusIndicator({
  isOnline,
  pendingCount,
  lastSyncedAt,
}: OnlineStatusIndicatorProps) {
  let tooltip = "Connected";
  if (!isOnline) {
    if (lastSyncedAt) {
      const minutes = Math.round(
        (Date.now() - lastSyncedAt.getTime()) / 60000,
      );
      tooltip = `Offline — last synced ${minutes}m ago`;
    } else {
      tooltip = "Offline";
    }
  }

  return (
    <div className="flex items-center gap-1.5" title={tooltip}>
      <span
        data-testid="online-status-dot"
        className={`inline-block w-2 h-2 rounded-full ${
          isOnline ? "bg-green-500" : "bg-yellow-500"
        }`}
      />
      {pendingCount > 0 && (
        <span
          data-testid="pending-count"
          className="text-[10px] text-muted-foreground"
        >
          {pendingCount} pending
        </span>
      )}
    </div>
  );
}
