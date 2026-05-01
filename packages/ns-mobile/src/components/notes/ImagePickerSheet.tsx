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

// Phase D — image insertion entry point. Mirrors the AiActionsSheet
// shape: a single sparkle/icon on the toolbar opens this bottom
// sheet so we don't burn horizontal toolbar space on per-source
// buttons. Phase D.4 will add a "Scan Document" row using the
// native VisionKit / ML Kit document scanners.

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export type ImagePickerSource = "library" | "camera";

interface SourceDef {
  key: ImagePickerSource;
  label: string;
  description: string;
  icon: IconName;
}

const SOURCES: SourceDef[] = [
  {
    key: "camera",
    label: "Take Photo",
    description: "Open the camera and capture a new photo.",
    icon: "camera-outline",
  },
  {
    key: "library",
    label: "Choose from Library",
    description: "Pick a photo from your camera roll.",
    icon: "image-multiple-outline",
  },
];

export interface ImagePickerSheetProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  onPick: (source: ImagePickerSource) => void;
  /** When set, the matching row shows a spinner. The sheet stays
   *  open so the user can still cancel via backdrop tap. */
  busyKey?: ImagePickerSource | null;
  /** Fires when the sheet closes (backdrop tap, swipe-down, or
   *  programmatic dismiss). The editor uses this to restore
   *  keyboard focus when the user cancels without picking. */
  onDismiss?: () => void;
}

export function ImagePickerSheet({
  bottomSheetRef,
  onPick,
  busyKey,
  onDismiss,
}: ImagePickerSheetProps) {
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

  // Match FolderPicker's BottomSheetModal config exactly — that
  // sheet opens reliably from this same screen. Earlier we were
  // using `enableDynamicSizing={false}` + a single low snap point,
  // which appears to interact badly with the new architecture's
  // sheet-mount path on Android.
  const snapPoints = useMemo(() => ["40%"], []);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: themeColors.card }}
      handleIndicatorStyle={{ backgroundColor: themeColors.muted }}
      onDismiss={onDismiss}
    >
      <BottomSheetView style={styles.container}>
        <View style={styles.header}>
          <MaterialCommunityIcons
            name="image-plus"
            size={18}
            color={themeColors.primary}
          />
          <Text style={[styles.title, { color: themeColors.foreground }]}>
            Insert Image
          </Text>
        </View>

        {SOURCES.map((source) => {
          const isBusy = busyKey === source.key;
          return (
            <Pressable
              key={source.key}
              onPress={() => {
                if (isBusy) return;
                bottomSheetRef.current?.dismiss();
                onPick(source.key);
              }}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? themeColors.input : "transparent",
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={source.label}
              accessibilityState={{ busy: isBusy }}
            >
              <MaterialCommunityIcons
                name={source.icon}
                size={22}
                color={themeColors.primary}
                style={styles.rowIcon}
              />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: themeColors.foreground }]}>
                  {source.label}
                </Text>
                <Text style={[styles.rowDescription, { color: themeColors.muted }]}>
                  {source.description}
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
