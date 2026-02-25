import { useState, useEffect } from "react";
import type { Account, FourOhOneKInputs, Frequency } from "@derekentringer/shared/finance";
import { fetchAccounts } from "@/api/accounts";
import { fetchBalances } from "@/api/balances";
import { fetchIncomeSources } from "@/api/incomeSources";
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
import { FourOhOneKCalculator } from "./FourOhOneKCalculator";

function frequencyToAnnualMultiplier(freq: Frequency): number {
  switch (freq) {
    case "weekly": return 52;
    case "biweekly": return 26;
    case "monthly": return 12;
    case "quarterly": return 4;
    case "yearly": return 1;
  }
}

const DEFAULT_INPUTS: FourOhOneKInputs = {
  annualSalary: 0,
  currentContributionPct: 6,
  employerMatchPct: 50,
  employerMatchCapPct: 6,
  expectedAnnualReturnPct: 7,
  currentBalance: 0,
};

export function FourOhOneKTab() {
  const [investmentAccounts, setInvestmentAccounts] = useState<Account[]>([]);
  const [estimatedSalary, setEstimatedSalary] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAccountId, setSelectedAccountId] = useState<string>("manual");
  const [defaults, setDefaults] = useState<FourOhOneKInputs>(DEFAULT_INPUTS);
  const [defaultsReady, setDefaultsReady] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAccounts("investment"),
      fetchIncomeSources(true).catch(() => ({ incomeSources: [] })),
    ])
      .then(([{ accounts }, { incomeSources }]) => {
        setInvestmentAccounts(accounts);
        if (accounts[0]) setSelectedAccountId(accounts[0].id);

        // Estimate annual salary from active income sources
        const annualIncome = incomeSources.reduce(
          (sum, src) => sum + src.amount * frequencyToAnnualMultiplier(src.frequency),
          0,
        );
        setEstimatedSalary(Math.round(annualIncome));
      })
      .catch(() => setError("Failed to load accounts"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    async function populate() {
      const newDefaults = { ...DEFAULT_INPUTS };

      if (estimatedSalary > 0) {
        newDefaults.annualSalary = estimatedSalary;
      }

      if (selectedAccountId !== "manual") {
        const acct = investmentAccounts.find((a) => a.id === selectedAccountId);
        if (acct) {
          newDefaults.currentBalance = acct.currentBalance;
          newDefaults.investmentAccountId = acct.id;
          try {
            const { balances } = await fetchBalances(acct.id);
            const profile = balances[0]?.investmentProfile;
            if (profile?.rateOfReturn) {
              newDefaults.expectedAnnualReturnPct = profile.rateOfReturn;
            }
          } catch { /* use defaults */ }
        }
      }

      setDefaults(newDefaults);
      setDefaultsReady(true);
    }
    populate();
  }, [selectedAccountId, investmentAccounts, estimatedSalary]);

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
      {/* Account selector */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Investment Account</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  {investmentAccounts.map((a) => (
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
        <FourOhOneKCalculator key={JSON.stringify(defaults)} defaults={defaults} />
      )}
    </div>
  );
}
