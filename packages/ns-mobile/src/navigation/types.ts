export type NotesStackParamList = {
  NotesList: undefined;
  NoteDetail: { noteId: string };
  NoteEditor: { noteId?: string };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Security: undefined;
  TotpSetup: undefined;
  About: undefined;
};
