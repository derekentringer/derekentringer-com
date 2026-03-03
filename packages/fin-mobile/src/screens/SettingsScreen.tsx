import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MenuRow, MenuSection, MenuSeparator } from "@/components/common/MenuRow";
import type { MoreStackParamList } from "@/navigation/types";
import { colors, spacing } from "@/theme";

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      <MenuSection title="Data Management">
        <MenuRow
          icon="shape-outline"
          label="Categories"
          subtitle="Manage transaction categories"
          onPress={() => navigation.navigate("Categories")}
        />
        <MenuSeparator />
        <MenuRow
          icon="auto-fix"
          label="Category Rules"
          subtitle="Auto-categorize transactions"
          onPress={() => navigation.navigate("CategoryRules")}
        />
        <MenuSeparator />
        <MenuRow
          icon="cash-multiple"
          label="Income Sources"
          subtitle="Track income for projections"
          onPress={() => navigation.navigate("IncomeSources")}
        />
      </MenuSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
});
