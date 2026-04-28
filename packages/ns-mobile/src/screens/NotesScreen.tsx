import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NotesStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { NoteListScreen } from "./NoteListScreen";
import { NoteDetailScreen } from "./NoteDetailScreen";
import { NoteEditorScreen } from "./NoteEditorScreen";

const Stack = createNativeStackNavigator<NotesStackParamList>();

export function NotesScreen() {
  const themeColors = useThemeColors();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: themeColors.background },
        headerTintColor: themeColors.foreground,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="NotesList"
        component={NoteListScreen}
        options={{ title: "Notes" }}
      />
      <Stack.Screen
        name="NoteDetail"
        component={NoteDetailScreen}
        options={{ title: "" }}
      />
      <Stack.Screen
        name="NoteEditor"
        component={NoteEditorScreen}
        options={{ title: "Editor" }}
      />
    </Stack.Navigator>
  );
}
