import { cn } from '@/lib/format';

/** Company logo (public/logo.png) on a light tile so it stays legible on dark surfaces. */
export function BrandLogo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5', className)}
      style={{ width: size, height: size, padding: Math.round(size * 0.14) }}
    >
      <img src="/logo.png" alt="" aria-hidden className="h-full w-full object-contain" draggable={false} />
    </span>
  );
}
