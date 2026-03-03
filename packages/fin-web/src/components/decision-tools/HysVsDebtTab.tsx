import { useState, useEffect } from "react";
import type { Account, HysVsDebtInputs, AccountType } from "@derekentringer/shared/finance";
import { isCashAccountType } from "@derekentringer/shared/finance";
import { fetchAccounts } from "@/api/accounts";
import { fetchBalances } from "@/api/balances";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { HysVsDebtCalculator } from "./HysVsDebtCalculator";

const DEFAULT_INPUTS: HysVsDebtInputs = {
  hysBalance: 0,
  hysApy: 4.0,
  loanBalance: 0,
  loanApr: 6.0,
  monthlyPayment: 500,
};

export function HysVsDebtTab() {
  const [savingsAccounts, setSavingsAccounts] = useState<Account[]>([]);
  const [loanAccounts, setLoanAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedHysId, setSelectedHysId] = useState<string>("manual");
  const [selectedLoanId, setSelectedLoanId] = useState<string>("manual");
  const [defaults, setDefaults] = useState<HysVsDebtInputs>(DEFAULT_INPUTS);
  const [defaultsReady, setDefaultsReady] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchAccounts()
      .then(({ accounts }) => {
        const savings = accounts.filter((a) =>
          isCashAccountType(a.type as AccountType),
        );
        const loans = accounts.filter((a) => a.type === "loan");
        setSavingsAccounts(savings);
        setLoanAccounts(loans);

        // Auto-select first accounts
        const firstSavings = savings[0];
        const firstLoan = loans[0];
        if (firstSavings) setSelectedHysId(firstSavings.id);
        if (firstLoan) setSelectedLoanId(firstLoan.id);
      })
      .catch(() => setError("Failed to load accounts"))
      .finally(() => setLoading(false));
  }, []);

  // Populate defaults from selected accounts
  useEffect(() => {
    async function populate() {
      const newDefaults = { ...DEFAULT_INPUTS };

      if (selectedHysId !== "manual") {
        const acct = savingsAccounts.find((a) => a.id === selectedHysId);
        if (acct) {
          newDefaults.hysBalance = acct.currentBalance;
          newDefaults.hysAccountId = acct.id;
          try {
            const { balances } = await fetchBalances(acct.id);
            if (balances[0]?.savingsProfile?.apy) {
              newDefaults.hysApy = balances[0].savingsProfile.apy;
            }
          } catch { /* use default APY */ }
        }
      }

      if (selectedLoanId !== "manual") {
        const acct = loanAccounts.find((a) => a.id === selectedLoanId);
        if (acct) {
          newDefaults.loanBalance = acct.currentBalance;
          newDefaults.loanAccountId = acct.id;
          if (acct.interestRate) newDefaults.loanApr = acct.interestRate;
          try {
            const { balances } = await fetchBalances(acct.id);
            if (balances[0]?.loanProfile?.monthlyPayment) {
              newDefaults.monthlyPayment = balances[0].loanProfile.monthlyPayment;
            }
            if (balances[0]?.loanProfile?.interestRate) {
              newDefaults.loanApr = balances[0].loanProfile.interestRate;
            }
          } catch { /* use account interest rate */ }
        }
      }

      setDefaults(newDefaults);
      setDefaultsReady(true);
    }
    populate();
  }, [selectedHysId, selectedLoanId, savingsAccounts, loanAccounts]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-skeleton rounded w-48" />
            <div className="h-[350px] bg-skeleton rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-destructive text-center">{error}</p>
          <div className="flex justify-center mt-2">
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Account selectors */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Savings Account</Label>
              <Select value={selectedHysId} onValueChange={setSelectedHysId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  {savingsAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.institution})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Loan Account</Label>
              <Select value={selectedLoanId} onValueChange={setSelectedLoanId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  {loanAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.institution})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {defaultsReady && (
        <HysVsDebtCalculator key={JSON.stringify(defaults)} defaults={defaults} />
      )}
    </div>
  );
}
