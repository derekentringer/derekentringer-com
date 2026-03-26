import type { NavigatorScreenParams } from "@react-navigation/native";

export type NotesStackParamList = {
  NotesList: undefined;
  NoteDetail: { noteId: string };
  NoteEditor: { noteId?: string };
};

export type DashboardStackParamList = {
  DashboardHome: undefined;
  NoteDetail: { noteId: string };
};

export type MainTabParamList = {
  Dashboard: NavigatorScreenParams<DashboardStackParamList>;
  Notes: NavigatorScreenParams<NotesStackParamList>;
  Search: undefined;
  AI: undefined;
  Settings: undefined;
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Security: undefined;
  TotpSetup: undefined;
  About: undefined;
};
