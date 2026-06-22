type IconProps = { size?: number };

export function IconTable({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" />
      <line x1="1.5" y1="6" x2="14.5" y2="6" />
      <line x1="6" y1="6" x2="6" y2="14.5" />
    </svg>
  );
}

export function IconBarChart({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="7" width="4" height="8" />
      <rect x="6" y="4" width="4" height="11" />
      <rect x="11" y="1" width="4" height="14" />
    </svg>
  );
}

export function IconRefresh({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

export function IconChevronLeft({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function IconChevronRight({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function IconDownload({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8" />
      <path d="M4 7l4 4 4-4" />
      <path d="M2 13h12" />
    </svg>
  );
}

export function IconCopy({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="9" height="10" rx="1.5" />
      <path d="M11 2H2a1 1 0 0 0-1 1v9" />
    </svg>
  );
}

export function IconCheck({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,8 6,12 14,4" />
    </svg>
  );
}

export function IconTree({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="3.5" cy="13" r="1.5" />
      <circle cx="12.5" cy="13" r="1.5" />
      <line x1="8" y1="4.5" x2="8" y2="8.5" />
      <path d="M8 8.5 L3.5 11.5 M8 8.5 L12.5 11.5" />
    </svg>
  );
}

export function IconCode({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4,5 1,8 4,11" />
      <polyline points="12,5 15,8 12,11" />
      <line x1="9.5" y1="3" x2="6.5" y2="13" />
    </svg>
  );
}

export function IconExpandAll({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,4 8,8.5 13,4" />
      <polyline points="3,9 8,13.5 13,9" />
    </svg>
  );
}

export function IconCollapseAll({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,12 8,7.5 13,12" />
      <polyline points="3,7 8,2.5 13,7" />
    </svg>
  );
}

export function IconEye({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M1 8C3 4.5 13 4.5 15 8C13 11.5 3 11.5 1 8" />
      <circle cx="8" cy="8" r="2.3" />
    </svg>
  );
}
