import React, { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import useAuthStore from "@/store/authStore";
import { LoginScreen } from "@/screens/LoginScreen";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { AccountsScreen } from "@/screens/AccountsScreen";
import { AccountTypeScreen } from "@/screens/AccountTypeScreen";
import { AccountDetailScreen } from "@/screens/AccountDetailScreen";
import { TransactionsScreen } from "@/screens/TransactionsScreen";
import { TransactionDetailScreen } from "@/screens/TransactionDetailScreen";
import { PlanningHomeScreen } from "@/screens/PlanningHomeScreen";
import { BillsScreen } from "@/screens/BillsScreen";
import { BillDetailScreen } from "@/screens/BillDetailScreen";
import { BudgetsScreen } from "@/screens/BudgetsScreen";
import { MoreScreen } from "@/screens/MoreScreen";
import type { PlanningStackParamList } from "@/navigation/types";
import { colors } from "@/theme";

type AccountsStackParamList = {
  AccountsList: undefined;
  AccountType: { groupSlug: string; groupLabel: string };
  AccountDetail: { accountId: string; accountName: string };
};

type ActivityStackParamList = {
  TransactionsList: { accountId?: string } | undefined;
  TransactionDetail: { transactionId: string };
};

const AuthStack = createNativeStackNavigator();
const MainTab = createBottomTabNavigator();
const AccountsStack = createNativeStackNavigator<AccountsStackParamList>();
const ActivityStack = createNativeStackNavigator<ActivityStackParamList>();
const PlanningStack = createNativeStackNavigator<PlanningStackParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.foreground,
  headerShadowVisible: false,
} as const;

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

function AccountsStackNavigator() {
  return (
    <AccountsStack.Navigator screenOptions={stackScreenOptions}>
      <AccountsStack.Screen
        name="AccountsList"
        component={AccountsScreen}
        options={{ title: "Accounts" }}
      />
      <AccountsStack.Screen
        name="AccountType"
        component={AccountTypeScreen}
        options={{ title: "Accounts" }}
      />
      <AccountsStack.Screen
        name="AccountDetail"
        component={AccountDetailScreen}
        options={{ title: "Account" }}
      />
    </AccountsStack.Navigator>
  );
}

function ActivityStackNavigator() {
  return (
    <ActivityStack.Navigator screenOptions={stackScreenOptions}>
      <ActivityStack.Screen
        name="TransactionsList"
        component={TransactionsScreen}
        options={{ title: "Activity" }}
      />
      <ActivityStack.Screen
        name="TransactionDetail"
        component={TransactionDetailScreen}
        options={{ title: "Transaction" }}
      />
    </ActivityStack.Navigator>
  );
}

function PlanningStackNavigator() {
  return (
    <PlanningStack.Navigator screenOptions={stackScreenOptions}>
      <PlanningStack.Screen
        name="PlanningHome"
        component={PlanningHomeScreen}
        options={{ title: "Planning" }}
      />
      <PlanningStack.Screen
        name="BillsList"
        component={BillsScreen}
        options={{ title: "Bills" }}
      />
      <PlanningStack.Screen
        name="BillDetail"
        component={BillDetailScreen}
        options={({ route }) => ({ title: route.params.billName })}
      />
      <PlanningStack.Screen
        name="BudgetsList"
        component={BudgetsScreen}
        options={{ title: "Budgets" }}
      />
    </PlanningStack.Navigator>
  );
}

function MainTabNavigator() {
  return (
    <MainTab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
      }}
    >
      <MainTab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard" color={color} size={size} />
          ),
        }}
      />
      <MainTab.Screen
        name="Accounts"
        component={AccountsStackNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="bank" color={color} size={size} />
          ),
        }}
      />
      <MainTab.Screen
        name="Activity"
        component={ActivityStackNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="swap-horizontal" color={color} size={size} />
          ),
        }}
      />
      <MainTab.Screen
        name="Planning"
        component={PlanningStackNavigator}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chart-line" color={color} size={size} />
          ),
        }}
      />
      <MainTab.Screen
        name="More"
        component={MoreScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="dots-horizontal" color={color} size={size} />
          ),
        }}
      />
    </MainTab.Navigator>
  );
}

export function AppNavigator() {
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainTabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
