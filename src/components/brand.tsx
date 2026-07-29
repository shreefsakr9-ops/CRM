/** شعار Blue Point — دائرتان متداخلتان (أحمر/أزرق) بأسلوب مبسط يعمل على أي خلفية. */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-label="Blue Point"
      role="img"
    >
      <circle cx="25" cy="26" r="19" fill="rgb(var(--bp-red))" />
      <circle cx="40" cy="35" r="19" fill="rgb(var(--bp-cyan))" />
      <path
        d="M30 34c3-6 9-9 15-9-2 5-6 9-11 11l3 5-6-2-4 4 1-6-5-1z"
        fill="rgb(var(--bp-navy-900))"
        opacity="0.92"
      />
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-bold tracking-tight">Blue</span>
      <span className="bp-gradient-text font-bold tracking-tight"> Point</span>
    </span>
  );
}
