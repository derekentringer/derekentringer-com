export interface SyncQueueEntry {
  id: number;
  entity_id: string;
  entity_type: "note" | "folder";
  action: string;
  payload: string | null;
  created_at: string;
}
