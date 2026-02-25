import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { HysVsDebtInputs, HysVsDebtResult } from "@derekentringer/shared/finance";
import { calculateHysVsDebt } from "@/lib/decisionCalculators";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { HysVsDebtChart } from "./HysVsDebtChart";
import { formatCurrency } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";
import { PiggyBank, CreditCard, TrendingUp, RotateCcw, Info } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const LS_KEY = "decisionTools.hysVsDebt";

interface HysVsDebtCalculatorProps {
  defaults: HysVsDebtInputs;
}

function loadFromStorage(defaults: HysVsDebtInputs): HysVsDebtInputs {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return defaults;
}

export function HysVsDebtCalculator({ defaults }: HysVsDebtCalculatorProps) {
  const [inputs, setInputs] = useState<HysVsDebtInputs>(() => loadFromStorage(defaults));
  const [result, setResult] = useState<HysVsDebtResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalculate = useCallback((inp: HysVsDebtInputs) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setResult(calculateHysVsDebt(inp));
    }, 300);
  }, []);

  useEffect(() => {
    recalculate(inputs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputs, recalculate]);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(inputs)); } catch { /* ignore */ }
  }, [inputs]);

  const update = (field: keyof HysVsDebtInputs, value: number) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const resetDefaults = () => {
    localStorage.removeItem(LS_KEY);
    setInputs(defaults);
  };

  const interestDelta = useMemo(() => {
    if (!result) return 0;
    return (result.scenarioA_totalInterestEarned - result.scenarioA_totalInterestPaid)
      - (result.scenarioB_totalInterestEarned - result.scenarioB_totalInterestPaid);
  }, [result]);

  return (
    <div className="flex flex-col gap-4">
      {/* Inputs */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Parameters</h3>
            <Button variant="ghost" size="sm" onClick={resetDefaults}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label className="text-xs">HYS Balance</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={inputs.hysBalance}
                onChange={(e) => update("hysBalance", Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">HYS APY (%)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={inputs.hysApy}
                onChange={(e) => update("hysApy", Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Loan Balance</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={inputs.loanBalance}
                onChange={(e) => update("loanBalance", Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Loan APR (%)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={inputs.loanApr}
                onChange={(e) => update("loanApr", Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Monthly Payment</Label>
              <Input
                type="number"
                min={0}
                step={50}
                value={inputs.monthlyPayment}
                onChange={(e) => update("monthlyPayment", Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      {result && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                {result.recommendation === "keep-hys" ? (
                  <PiggyBank className="h-4 w-4 text-amber-500" />
                ) : (
                  <CreditCard className="h-4 w-4 text-green-500" />
                )}
                <p className="text-xs text-muted-foreground">Recommendation</p>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    {result.recommendation === "pay-loan" ? (
                      <p>
                        Use your HYS savings to make a lump-sum payment on the loan.
                        Your loan APR is higher than your HYS APY, so the interest
                        you save on the loan exceeds what you'd earn in savings
                        — leaving you {formatCurrency(Math.abs(result.netBenefit))} better off.
                      </p>
                    ) : (
                      <p>
                        Keep your money in the high-yield savings account.
                        Your HYS APY is earning more than your loan APR costs,
                        so you come out ahead by keeping the savings
                        and making regular loan payments.
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className={cn(
                "text-lg font-bold",
                result.recommendation === "keep-hys" ? "text-amber-500" : "text-green-500",
              )}>
                {result.recommendation === "keep-hys" ? "Keep HYS" : "Pay Down Loan"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Net Benefit</p>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>
                      The dollar difference in your final net position between the two scenarios.
                      This is how much more money you end up with by following the recommendation.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className={cn(
                "text-lg font-bold",
                result.netBenefit > 0 ? "text-green-500" : "text-amber-500",
              )}>
                {formatCurrency(Math.abs(result.netBenefit))}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-muted-foreground">Break-Even</p>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>
                      The month when paying down the loan starts to outperform keeping the HYS.
                      Before this point, keeping the HYS has a higher net position.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-lg font-bold">
                {result.breakEvenMonth !== null ? `Month ${result.breakEvenMonth}` : "N/A"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-muted-foreground">Interest Delta</p>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>
                      The difference in net interest (earned minus paid) between the two scenarios.
                      Shows how much more interest you'd keep by following the recommendation.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className={cn(
                "text-lg font-bold",
                interestDelta > 0 ? "text-green-500" : "text-amber-500",
              )}>
                {formatCurrency(Math.abs(interestDelta))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart */}
      {result && result.schedule.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <HysVsDebtChart
              schedule={result.schedule}
              breakEvenMonth={result.breakEvenMonth}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
