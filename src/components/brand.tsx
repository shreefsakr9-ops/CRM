/** شعار Blue Point الفعلي (الدائرتان المتداخلتان والدولفين) — خلفية شفافة تعمل على أي سطح. */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo-mark.png"
      alt="Blue Point"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
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
