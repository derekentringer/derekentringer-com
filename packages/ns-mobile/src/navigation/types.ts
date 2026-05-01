import type { NavigatorScreenParams } from "@react-navigation/native";
import type { Note } from "@derekentringer/ns-shared";

export type NotesStackParamList = {
  NotesList: undefined;
  NoteDetail: { noteId: string };
  NoteEditor: { noteId?: string };
};

export type DashboardStackParamList = {
  DashboardHome: undefined;
  NoteDetail: { noteId: string };
  NoteEditor: { noteId?: string };
  /** Optional `mode` skips the in-screen picker and starts that
   *  recording mode immediately. Used by the Quick Actions buttons
   *  on the Dashboard. */
  Recording: { mode?: "meeting" | "lecture" | "memo" | "verbatim" } | undefined;
};

export type AiStackParamList = {
  AiHome: undefined;
  NoteDetail: { noteId: string };
  NoteEditor: { noteId?: string };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Trash: undefined;
  TrashNoteDetail: { note: Note };
  Security: undefined;
  TotpSetup: undefined;
  About: undefined;
};

export type MainTabParamList = {
  Dashboard: NavigatorScreenParams<DashboardStackParamList>;
  Notes: NavigatorScreenParams<NotesStackParamList>;
  AI: NavigatorScreenParams<AiStackParamList>;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
};
