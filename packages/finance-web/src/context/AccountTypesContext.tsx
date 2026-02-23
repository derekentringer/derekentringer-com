import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { Account, AccountTypeGroup } from "@derekentringer/shared/finance";
import { ACCOUNT_TYPE_GROUPS } from "@derekentringer/shared/finance";
import { fetchAccounts } from "../api/accounts.ts";

interface AccountTypesContextValue {
  activeGroups: AccountTypeGroup[];
  groupCounts: Record<string, number>;
  isLoading: boolean;
  refresh: () => void;
}

const AccountTypesContext = createContext<AccountTypesContextValue>({
  activeGroups: [],
  groupCounts: {},
  isLoading: true,
  refresh: () => {},
});

export function useAccountTypes() {
  return useContext(AccountTypesContext);
}

export function AccountTypesProvider({ children }: { children: ReactNode }) {
  const [activeGroups, setActiveGroups] = useState<AccountTypeGroup[]>([]);
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { accounts } = await fetchAccounts();
      const accountTypes = new Set(accounts.map((a: Account) => a.type));
      const groups = ACCOUNT_TYPE_GROUPS.filter((g) =>
        g.types.some((t) => accountTypes.has(t)),
      );
      setActiveGroups(groups);

      const counts: Record<string, number> = {};
      for (const g of ACCOUNT_TYPE_GROUPS) {
        const count = accounts.filter((a: Account) => g.types.includes(a.type)).length;
        if (count > 0) counts[g.slug] = count;
      }
      setGroupCounts(counts);
    } catch {
      // Silently fail — sidebar will just show no account groups
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AccountTypesContext.Provider value={{ activeGroups, groupCounts, isLoading, refresh }}>
      {children}
    </AccountTypesContext.Provider>
  );
}
