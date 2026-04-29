import React, { useCallback, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/theme/colors";
import { spacing, borderRadius } from "@/theme";

// Phase B (mobile parity): inline AI editor actions live behind a
// single sparkle button on the markdown toolbar. Tapping the
// sparkle opens this bottom sheet so we don't have to fight for
// horizontal toolbar space and so the actions can grow without
// breaking the layout. Actions are wired by the editor screen via
// the per-action callbacks; an action with `null` handler renders
// disabled (used while the corresponding phase is unimplemented).

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export type AiActionKey =
  | "summarize"
  | "tags"
  | "continue"
  | "rewrite";

interface ActionDef {
  key: AiActionKey;
  label: string;
  description: string;
  icon: IconName;
}

const ACTIONS: ActionDef[] = [
  {
    key: "summarize",
    label: "Generate Summary",
    description: "Create a short summary banner for this note.",
    icon: "text-box-outline",
  },
  {
    key: "tags",
    label: "Suggest Tags",
    description: "Propose tags based on the note's content.",
    icon: "tag-multiple-outline",
  },
  {
    key: "continue",
    label: "Continue Writing",
    description: "Append AI-generated text at the cursor.",
    icon: "lead-pencil",
  },
  {
    key: "rewrite",
    label: "AI Rewrite",
    description: "Rewrite the selected text in a chosen style.",
    icon: "auto-fix",
  },
];

export interface AiActionsSheetProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  /** Per-action handlers. Pass `null` for an action that isn't
   *  available yet — it will render disabled. Actions with a
   *  non-null handler dismiss the sheet on tap and then run the
   *  callback. */
  handlers: Partial<Record<AiActionKey, (() => void) | null>>;
  /** Optional in-flight key — that action's row shows a spinner. */
  busyKey?: AiActionKey | null;
}

export function AiActionsSheet({
  bottomSheetRef,
  handlers,
  busyKey,
}: AiActionsSheetProps) {
  const themeColors = useThemeColors();

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    [],
  );

  const snapPoints = useMemo(() => ["55%"], []);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: themeColors.card }}
      handleIndicatorStyle={{ backgroundColor: themeColors.muted }}
    >
      <BottomSheetView style={styles.container}>
        <View style={styles.header}>
          <MaterialCommunityIcons
            name="auto-fix"
            size={18}
            color={themeColors.primary}
          />
          <Text style={[styles.title, { color: themeColors.foreground }]}>
            AI Actions
          </Text>
        </View>

        {ACTIONS.map((action) => {
          const handler = handlers[action.key];
          const isAvailable = typeof handler === "function";
          const isBusy = busyKey === action.key;
          return (
            <Pressable
              key={action.key}
              onPress={() => {
                if (!isAvailable || isBusy) return;
                bottomSheetRef.current?.dismiss();
                handler();
              }}
              disabled={!isAvailable || isBusy}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed
                    ? themeColors.input
                    : "transparent",
                  opacity: !isAvailable ? 0.45 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityState={{
                disabled: !isAvailable || isBusy,
                busy: isBusy,
              }}
            >
              <MaterialCommunityIcons
                name={action.icon}
                size={22}
                color={themeColors.primary}
                style={styles.rowIcon}
              />
              <View style={styles.rowText}>
                <Text
                  style={[styles.rowLabel, { color: themeColors.foreground }]}
                >
                  {action.label}
                </Text>
                <Text
                  style={[
                    styles.rowDescription,
                    { color: themeColors.muted },
                  ]}
                >
                  {!isAvailable ? "Coming soon" : action.description}
                </Text>
              </View>
              {isBusy ? (
                <MaterialCommunityIcons
                  name="loading"
                  size={18}
                  color={themeColors.muted}
                />
              ) : null}
            </Pressable>
          );
        })}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  rowIcon: {
    width: 22,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  rowDescription: {
    fontSize: 12,
  },
});
