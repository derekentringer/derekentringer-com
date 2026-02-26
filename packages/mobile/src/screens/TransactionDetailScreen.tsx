import React, { useState, useEffect, useCallback, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  useTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useCategories,
} from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { PickerField } from "@/components/common/PickerField";
import { FormField } from "@/components/common/FormField";
import { PinGateModal } from "@/components/common/PinGateModal";
import { SkeletonCard } from "@/components/common/SkeletonLoader";
import { ErrorCard } from "@/components/common/ErrorCard";
import { formatCurrencyFull } from "@/lib/chartTheme";
import { colors, spacing, borderRadius } from "@/theme";

type TransactionDetailRouteParams = {
  TransactionDetail: { transactionId: string };
};

export function TransactionDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<TransactionDetailRouteParams, "TransactionDetail">>();
  const { transactionId } = route.params;

  const transactionQuery = useTransaction(transactionId);
  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();
  const updateMutation = useUpdateTransaction();
  const deleteMutation = useDeleteTransaction();

  const [editedCategory, setEditedCategory] = useState("");
  const [editedNotes, setEditedNotes] = useState("");
  const [pinModalVisible, setPinModalVisible] = useState(false);

  const transaction = transactionQuery.data?.transaction;

  // Pre-fill editable fields when data loads
  useEffect(() => {
    if (transaction) {
      setEditedCategory(transaction.category ?? "");
      setEditedNotes(transaction.notes ?? "");
    }
  }, [transaction]);

  // Set header options
  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Transaction",
      headerRight: () => (
        <Pressable
          onPress={handleDeletePress}
          accessibilityRole="button"
          accessibilityLabel="Delete transaction"
          hitSlop={8}
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={22}
            color={colors.destructive}
          />
        </Pressable>
      ),
    });
  }, [navigation]);

  const categoryOptions = useMemo(() => {
    const options = [{ label: "None", value: "" }];
    if (categoriesQuery.data?.categories) {
      for (const cat of categoriesQuery.data.categories) {
        options.push({ label: cat.name, value: cat.name });
      }
    }
    return options;
  }, [categoriesQuery.data]);

  const accountName = useMemo(() => {
    if (!transaction || !accountsQuery.data?.accounts) return null;
    const account = accountsQuery.data.accounts.find(
      (a) => a.id === transaction.accountId,
    );
    return account?.name ?? transaction.accountId;
  }, [transaction, accountsQuery.data]);

  const hasChanges = useMemo(() => {
    if (!transaction) return false;
    const originalCategory = transaction.category ?? "";
    const originalNotes = transaction.notes ?? "";
    return editedCategory !== originalCategory || editedNotes !== originalNotes;
  }, [transaction, editedCategory, editedNotes]);

  const handleSave = useCallback(async () => {
    if (!transaction) return;
    await updateMutation.mutateAsync({
      id: transaction.id,
      data: {
        category: editedCategory || null,
        notes: editedNotes || null,
      },
    });
  }, [transaction, editedCategory, editedNotes, updateMutation]);

  const handleDeletePress = useCallback(() => {
    Alert.alert(
      "Delete Transaction",
      "Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => setPinModalVisible(true),
        },
      ],
    );
  }, []);

  const handlePinVerified = useCallback(
    async (pinToken: string) => {
      setPinModalVisible(false);
      if (!transaction) return;
      await deleteMutation.mutateAsync({
        id: transaction.id,
        pinToken,
      });
      navigation.goBack();
    },
    [transaction, deleteMutation, navigation],
  );

  if (transactionQuery.isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <SkeletonCard lines={3} />
        </View>
      </View>
    );
  }

  if (transactionQuery.error) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ErrorCard
            message="Failed to load transaction"
            onRetry={() => transactionQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  if (!transaction) return null;

  const isPositive = transaction.amount > 0;
  const formattedDate = new Date(transaction.date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero section */}
        <View style={styles.hero}>
          <Text
            style={[
              styles.amount,
              { color: isPositive ? colors.success : colors.foreground },
            ]}
          >
            {formatCurrencyFull(transaction.amount)}
          </Text>
          <Text style={styles.date}>{formattedDate}</Text>
          <Text style={styles.description}>{transaction.description}</Text>
          {accountName && (
            <Text style={styles.account}>Account: {accountName}</Text>
          )}
        </View>

        {/* Editable fields */}
        <View style={styles.fields}>
          <PickerField
            label="Category"
            value={editedCategory}
            options={categoryOptions}
            onValueChange={setEditedCategory}
            placeholder="Select category"
          />

          <FormField
            label="Notes"
            value={editedNotes}
            onChangeText={setEditedNotes}
            placeholder="Add notes..."
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Save button */}
        <Pressable
          style={[
            styles.saveButton,
            (!hasChanges || updateMutation.isPending) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
        >
          <Text style={styles.saveButtonText}>
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </ScrollView>

      <PinGateModal
        visible={pinModalVisible}
        onClose={() => setPinModalVisible(false)}
        onVerified={handlePinVerified}
        title="Confirm Delete"
        description="Enter your PIN to delete this transaction."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  amount: {
    fontSize: 32,
    fontWeight: "700",
  },
  date: {
    color: colors.muted,
    fontSize: 13,
  },
  description: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  account: {
    color: colors.mutedForeground,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  fields: {
    gap: spacing.md,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
