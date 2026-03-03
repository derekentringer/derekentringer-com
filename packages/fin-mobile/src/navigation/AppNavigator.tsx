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
import { GoalsScreen } from "@/screens/GoalsScreen";
import { GoalDetailScreen } from "@/screens/GoalDetailScreen";
import { ProjectionsScreen } from "@/screens/ProjectionsScreen";
import { PortfolioScreen } from "@/screens/PortfolioScreen";
import { DecisionToolsScreen } from "@/screens/DecisionToolsScreen";
import { MoreScreen } from "@/screens/MoreScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { CategoriesScreen } from "@/screens/CategoriesScreen";
import { CategoryRulesScreen } from "@/screens/CategoryRulesScreen";
import { IncomeSourcesScreen } from "@/screens/IncomeSourcesScreen";
import { NotificationPreferencesScreen } from "@/screens/NotificationPreferencesScreen";
import { NotificationHistoryScreen } from "@/screens/NotificationHistoryScreen";
import { AiInsightsSettingsScreen } from "@/screens/AiInsightsSettingsScreen";
import { ReportsScreen } from "@/screens/ReportsScreen";
import { AboutScreen } from "@/screens/AboutScreen";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import type { PlanningStackParamList, MoreStackParamList } from "@/navigation/types";
import { colors } from "@/theme";

type AccountsStackParamList = {
  AccountsList: undefined;
  AccountType: { groupSlug: string; groupLabel: string };
  AccountDetail: { accountId: string; accountName: string };
  Portfolio: { accountId?: string } | undefined;
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
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

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
      <AccountsStack.Screen
        name="Portfolio"
        component={PortfolioScreen}
        options={{ title: "Portfolio" }}
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
      <PlanningStack.Screen
        name="GoalsList"
        component={GoalsScreen}
        options={{ title: "Goals" }}
      />
      <PlanningStack.Screen
        name="GoalDetail"
        component={GoalDetailScreen}
        options={({ route }) => ({ title: route.params.goalName })}
      />
      <PlanningStack.Screen
        name="Projections"
        component={ProjectionsScreen}
        options={{ title: "Projections" }}
      />
      <PlanningStack.Screen
        name="DecisionTools"
        component={DecisionToolsScreen}
        options={{ title: "Decision Tools" }}
      />
    </PlanningStack.Navigator>
  );
}

function MoreStackNavigator() {
  return (
    <MoreStack.Navigator screenOptions={stackScreenOptions}>
      <MoreStack.Screen
        name="MoreHome"
        component={MoreScreen}
        options={{ title: "More" }}
      />
      <MoreStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
      <MoreStack.Screen
        name="Categories"
        component={CategoriesScreen}
        options={{ title: "Categories" }}
      />
      <MoreStack.Screen
        name="CategoryRules"
        component={CategoryRulesScreen}
        options={{ title: "Category Rules" }}
      />
      <MoreStack.Screen
        name="IncomeSources"
        component={IncomeSourcesScreen}
        options={{ title: "Income Sources" }}
      />
      <MoreStack.Screen
        name="NotificationPreferences"
        component={NotificationPreferencesScreen}
        options={{ title: "Notifications" }}
      />
      <MoreStack.Screen
        name="NotificationHistory"
        component={NotificationHistoryScreen}
        options={{ title: "Notification History" }}
      />
      <MoreStack.Screen
        name="AiInsightsSettings"
        component={AiInsightsSettingsScreen}
        options={{ title: "AI Insights" }}
      />
      <MoreStack.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ title: "Reports" }}
      />
      <MoreStack.Screen
        name="About"
        component={AboutScreen}
        options={{ title: "About" }}
      />
    </MoreStack.Navigator>
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
          headerRight: () => <NotificationBadge />,
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
        component={MoreStackNavigator}
        options={{
          headerShown: false,
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
