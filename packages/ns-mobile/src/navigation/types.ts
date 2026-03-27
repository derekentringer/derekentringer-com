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
  AI: undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
};
