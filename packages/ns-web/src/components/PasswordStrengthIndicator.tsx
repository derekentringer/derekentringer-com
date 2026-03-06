import { validatePasswordStrength } from "@derekentringer/shared";

const RULES = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number", test: (p: string) => /[0-9]/.test(p) },
  { label: "Special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function PasswordStrengthIndicator({ password }: { password: string }) {
  if (!password) return null;

  const { valid } = validatePasswordStrength(password);
  const passed = RULES.filter((r) => r.test(password)).length;
  const strength = passed / RULES.length;

  const barColor = valid
    ? "bg-green-500"
    : strength >= 0.6
      ? "bg-yellow-500"
      : "bg-red-500";

  return (
    <div className="space-y-2">
      <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 rounded-full ${barColor}`}
          style={{ width: `${strength * 100}%` }}
        />
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li
              key={rule.label}
              className={ok ? "text-green-500" : "text-muted-foreground"}
            >
              {ok ? "\u2713" : "\u2022"} {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
