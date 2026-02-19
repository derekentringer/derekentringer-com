import type { CategoryRule } from "@derekentringer/shared";

export function categorizeTransaction(
  input: { description: string; bankCategory?: string | null },
  rules: CategoryRule[],
): string | null {
  const descLower = input.description.toLowerCase();

  for (const rule of rules) {
    const patternLower = rule.pattern.toLowerCase();

    if (rule.matchType === "exact") {
      if (descLower === patternLower) {
        return rule.category;
      }
    } else {
      // "contains"
      if (descLower.includes(patternLower)) {
        return rule.category;
      }
    }
  }

  if (input.bankCategory) {
    return input.bankCategory;
  }

  return null;
}
