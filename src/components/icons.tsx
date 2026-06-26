// Lightweight inline SVG icon set (no dependency). Stroke-based, currentColor,
// 24x24 viewBox. Pass `className` to size/color (e.g. "h-5 w-5 text-accent").
// Paths adapted from Heroicons (MIT).

type IconProps = { className?: string }

function Svg({ className, children, fill = 'none' }: IconProps & { children: React.ReactNode; fill?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconClose({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  )
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  )
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </Svg>
  )
}

export function IconPlus({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 4.5v15M4.5 12h15" />
    </Svg>
  )
}

export function IconMenu({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </Svg>
  )
}

export function IconDumbbell({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.5 6v12M3.5 8.5v7M17.5 6v12M20.5 8.5v7M6.5 12h11" />
    </Svg>
  )
}

export function IconCalendar({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.75 3v2.25M17.25 3v2.25M3 8.25h18M3 18.75V7.5A2.25 2.25 0 015.25 5.25h13.5A2.25 2.25 0 0121 7.5v11.25A2.25 2.25 0 0118.75 21H5.25A2.25 2.25 0 013 18.75z" />
    </Svg>
  )
}

export function IconChart({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 20.25h18M6.75 20.25v-7.5M12 20.25V8.25M17.25 20.25V4.5" />
    </Svg>
  )
}

export function IconTrophy({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8.25 21h7.5M12 17.25V21M6.75 4.5h10.5v4.5a5.25 5.25 0 01-10.5 0V4.5zM6.75 6H4.5a2.25 2.25 0 002.25 2.25M17.25 6h2.25a2.25 2.25 0 01-2.25 2.25" />
    </Svg>
  )
}

export function IconFlame({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2.25c.32 3.06-1.2 4.62-2.6 6.06C8.1 9.6 6.9 10.83 6.9 13.2a5.1 5.1 0 1010.2 0c0-1.5-.6-2.85-1.5-3.9.15.9-.3 1.95-1.05 2.4.45-1.95-.3-4.2-1.65-5.55C11.7 4.95 12.15 3.3 12 2.25z" />
    </svg>
  )
}

export function IconScale({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3v18M7.5 21h9M5.25 6.75h13.5M5.25 6.75L3 13.5a3 3 0 006 0L5.25 6.75zM18.75 6.75L21 13.5a3 3 0 01-6 0l3.75-6.75z" />
    </Svg>
  )
}

export function IconClock({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 6.75V12l3.75 2.25" />
      <circle cx="12" cy="12" r="9" />
    </Svg>
  )
}

export function IconUsers({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 11.25a3 3 0 100-6 3 3 0 000 6zM3.75 19.5a5.25 5.25 0 0110.5 0M16.5 11.25a2.625 2.625 0 100-5.25M16.5 14.25a4.5 4.5 0 013.75 5.25" />
    </Svg>
  )
}

export function IconCog({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.25M12 18.75V21M4.5 12H2.25M21.75 12H19.5M6.16 6.16L4.57 4.57M19.43 19.43l-1.59-1.59M17.84 6.16l1.59-1.59M4.57 19.43l1.59-1.59" />
    </Svg>
  )
}

export function IconBook({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 6.75C10.5 5.5 8.5 5 6 5.25 4.5 5.4 3.75 6 3.75 6.75v11.5c2.5-.5 5-.25 6.75 1 1.75-1.25 4.25-1.5 6.75-1V6.75c0-.75-.75-1.35-2.25-1.5C18.5 5 16.5 5.5 15 6.75M12 6.75V19.5" />
    </Svg>
  )
}
