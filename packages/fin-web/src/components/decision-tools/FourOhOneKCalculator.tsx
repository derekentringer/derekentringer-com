import { useState, useEffect, useRef, useCallback } from "react";
import type { FourOhOneKInputs, FourOhOneKResult } from "@derekentringer/shared/finance";
import { calculateFourOhOneK } from "@/lib/decisionCalculators";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FourOhOneKChart } from "./FourOhOneKChart";
import { formatCurrency } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";
import { DollarSign, Gift, AlertTriangle, Target, RotateCcw, Info } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const LS_KEY = "decisionTools.fourOhOneK";

interface FourOhOneKCalculatorProps {
  defaults: FourOhOneKInputs;
}

function loadFromStorage(defaults: FourOhOneKInputs): FourOhOneKInputs {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return defaults;
}

export function FourOhOneKCalculator({ defaults }: FourOhOneKCalculatorProps) {
  const [inputs, setInputs] = useState<FourOhOneKInputs>(() => loadFromStorage(defaults));
  const [result, setResult] = useState<FourOhOneKResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalculate = useCallback((inp: FourOhOneKInputs) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setResult(calculateFourOhOneK(inp));
    }, 300);
  }, []);

  useEffect(() => {
    recalculate(inputs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputs, recalculate]);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(inputs)); } catch { /* ignore */ }
  }, [inputs]);

  const update = (field: keyof FourOhOneKInputs, value: number) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const resetDefaults = () => {
    localStorage.removeItem(LS_KEY);
    setInputs(defaults);
  };

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Annual Salary</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={inputs.annualSalary}
                onChange={(e) => update("annualSalary", Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Your Contribution (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={inputs.currentContributionPct}
                onChange={(e) => update("currentContributionPct", Number(e.target.value) || 0)}
                className="mt-1"
              />
              <input
                type="range"
                min={0}
                max={50}
                step={0.5}
                value={inputs.currentContributionPct}
                onChange={(e) => update("currentContributionPct", Number(e.target.value))}
                className="w-full accent-blue-500 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Employer Match (%)</Label>
              <Input
                type="number"
                min={0}
                max={200}
                step={1}
                value={inputs.employerMatchPct}
                onChange={(e) => update("employerMatchPct", Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Match Cap (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={inputs.employerMatchCapPct}
                onChange={(e) => update("employerMatchCapPct", Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Expected Return (%)</Label>
              <Input
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={inputs.expectedAnnualReturnPct}
                onChange={(e) => update("expectedAnnualReturnPct", Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Current Balance</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={inputs.currentBalance}
                onChange={(e) => update("currentBalance", Number(e.target.value) || 0)}
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
                <DollarSign className="h-4 w-4 text-blue-500" />
                <p className="text-xs text-muted-foreground">Annual Contribution</p>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>
                      How much you contribute to your 401(k) per year at your current
                      contribution percentage, capped at the IRS annual limit ($23,500).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-lg font-bold">
                {formatCurrency(result.currentAnnualContribution)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="h-4 w-4 text-green-500" />
                <p className="text-xs text-muted-foreground">Employer Match</p>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>
                      Free money from your employer. They match a percentage of your
                      contributions up to a cap. This is the annual match you currently receive.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-lg font-bold text-green-500">
                {formatCurrency(result.currentEmployerMatch)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className={cn(
                  "h-4 w-4",
                  result.moneyLeftOnTable > 0 ? "text-red-500" : "text-green-500",
                )} />
                <p className="text-xs text-muted-foreground">Left on Table</p>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>
                      The employer match you're missing out on each year by contributing
                      below the match cap. Increase your contribution to the optimal
                      percentage to capture the full match.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className={cn(
                "text-lg font-bold",
                result.moneyLeftOnTable > 0 ? "text-red-500" : "text-green-500",
              )}>
                {formatCurrency(result.moneyLeftOnTable)}/yr
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-violet-500" />
                <p className="text-xs text-muted-foreground">Optimal %</p>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>
                      The minimum contribution percentage needed to maximize your
                      employer match. Contributing at least this much ensures you
                      capture every dollar of free money available.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-lg font-bold text-violet-500">
                {result.optimalContributionPct}%
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart */}
      {result && result.projection.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <FourOhOneKChart
              projection={result.projection}
              currentPct={inputs.currentContributionPct}
              optimalPct={result.optimalContributionPct}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
