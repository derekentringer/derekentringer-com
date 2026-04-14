interface NsLogoProps {
  className?: string;
}

export function NsLogo({ className }: NsLogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="512" height="512" rx="96" fill="var(--color-primary)" />
      <rect x="228" y="128" width="56" height="256" rx="28" fill="var(--color-primary-contrast)" />
      <rect x="128" y="228" width="256" height="56" rx="28" fill="var(--color-primary-contrast)" />
    </svg>
  );
}
