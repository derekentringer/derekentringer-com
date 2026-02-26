import React, { useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { colors } from "@/theme";

interface SwipeableRowProps {
  children: React.ReactNode;
  onEdit: () => void;
  onDelete?: () => void;
}

export function SwipeableRow({ children, onEdit, onDelete }: SwipeableRowProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const handleEdit = () => {
    swipeableRef.current?.close();
    onEdit();
  };

  const handleDelete = () => {
    swipeableRef.current?.close();
    onDelete?.();
  };

  const renderRightActions = () => (
    <View style={styles.actionsContainer}>
      <Pressable
        style={[styles.action, styles.editAction]}
        onPress={handleEdit}
        accessibilityRole="button"
        accessibilityLabel="Edit"
      >
        <Text style={styles.actionText}>Edit</Text>
      </Pressable>
      {onDelete && (
        <Pressable
          style={[styles.action, styles.deleteAction]}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete"
        >
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: "row",
  },
  action: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  editAction: {
    backgroundColor: colors.primary,
  },
  deleteAction: {
    backgroundColor: colors.destructive,
  },
  actionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
});
