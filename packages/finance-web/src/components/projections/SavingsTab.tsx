import { useState, useEffect } from "react";
import type { SavingsAccountSummary } from "@derekentringer/shared/finance";
import { fetchSavingsAccounts } from "@/api/projections.ts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SavingsProjectionCard } from "./SavingsProjectionCard";

export function SavingsTab() {
  const [accounts, setAccounts] = useState<SavingsAccountSummary[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAccountsLoading(true);
    fetchSavingsAccounts()
      .then(({ accounts }) => {
        setAccounts(accounts);
      })
      .catch(() => {
        setError("Failed to load savings accounts");
      })
      .finally(() => {
        setAccountsLoading(false);
      });
  }, []);

  const favorites = accounts.filter((a) => a.isFavorite);

  if (accountsLoading) {
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setError(null);
                setAccountsLoading(true);
                fetchSavingsAccounts()
                  .then(({ accounts }) => setAccounts(accounts))
                  .catch(() => setError("Failed to load savings accounts"))
                  .finally(() => setAccountsLoading(false));
              }}
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (favorites.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">
            Favorite a savings account on the Accounts page to see growth projections.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {favorites.map((acct) => (
        <SavingsProjectionCard key={acct.accountId} account={acct} />
      ))}
    </div>
  );
}
