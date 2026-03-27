import React, { useRef } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { NotesStackParamList } from "@/navigation/types";
import { useThemeColors } from "@/theme/colors";
import { SyncStatusIndicator } from "@/components/common/SyncStatusIndicator";
import { SyncIssuesSheet } from "@/components/sync/SyncIssuesSheet";
import { NoteListScreen } from "./NoteListScreen";
import { NoteDetailScreen } from "./NoteDetailScreen";
import { NoteEditorScreen } from "./NoteEditorScreen";

const Stack = createNativeStackNavigator<NotesStackParamList>();

export function NotesScreen() {
  const themeColors = useThemeColors();
  const syncIssuesRef = useRef<BottomSheetModal>(null);

  return (
    <>
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
          options={{
            title: "Notes",
            headerRight: () => (
              <SyncStatusIndicator onPressIssues={() => syncIssuesRef.current?.present()} />
            ),
          }}
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
      <SyncIssuesSheet bottomSheetRef={syncIssuesRef} />
    </>
  );
}
