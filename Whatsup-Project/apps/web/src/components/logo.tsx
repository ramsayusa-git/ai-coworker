"use client";
import { useBrand } from "@/components/brand-provider";

// The Loqio mark: a speech bubble whose tail doubles as the descender of a lowercase
// "q" — a ring with a straight descender, not an angled tail (that reads as a
// magnifying glass at favicon size). Drawn inline (rather than loaded as an <img>) so it inherits the partner's
// brand colour — a white-label reseller who hasn't uploaded their own logo still gets
// a mark in their own colour instead of the platform's green.
// The static copies used for the browser tab and app icons live in
// src/app/icon.svg, src/app/apple-icon.png and public/brand/ — regenerate the raster
// sizes with scripts/render-app-icons.py if this geometry ever changes.
export function LoqioMark({ size = 28, color, className = "" }: { size?: number; color?: string; className?: string }) {
  const brand = useBrand();
  const c = color ?? brand.primaryColor;
  const id = `lqm-${size}-${c.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} role="img" aria-label={brand.brandName}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c} />
          <stop offset="1" stopColor={c} stopOpacity="0.78" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <circle cx="13.4" cy="13.2" r="6.1" fill="none" stroke="#ffffff" strokeWidth="3.2" />
      <path d="M19.5 12.4 L19.5 25.4" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

// Mark + wordmark lock-up. A partner logo image, when one is set, replaces the whole
// lock-up — that is the point of white-labelling.
export function LoqioLogo({
  size = 28, textClassName = "text-lg font-semibold tracking-tight", imgClassName = "h-8 max-w-[11rem] object-contain",
}: { size?: number; textClassName?: string; imgClassName?: string }) {
  const brand = useBrand();
  if (brand.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logoUrl} alt={brand.brandName} className={imgClassName} />;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <LoqioMark size={size} />
      <span className={textClassName} style={{ color: brand.primaryColor }}>{brand.brandName}</span>
    </span>
  );
}
