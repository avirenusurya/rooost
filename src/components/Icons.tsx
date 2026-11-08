import type { ReactNode } from 'react';

function Icon({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number };

export const PlusIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const MoreIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="3.25" cy="8" r=".6" fill="currentColor" />
    <circle cx="8" cy="8" r=".6" fill="currentColor" />
    <circle cx="12.75" cy="8" r=".6" fill="currentColor" />
  </Icon>
);

export const GripIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="6" cy="3.5" r="1.25" />
    <circle cx="10" cy="3.5" r="1.25" />
    <circle cx="6" cy="8" r="1.25" />
    <circle cx="10" cy="8" r="1.25" />
    <circle cx="6" cy="12.5" r="1.25" />
    <circle cx="10" cy="12.5" r="1.25" />
  </svg>
);

export const SearchIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.25 10.25 3 3" />
  </Icon>
);

export const CloseIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);

export const CalendarIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <rect x="2.5" y="3.5" width="11" height="10" rx="2.25" />
    <path d="M2.5 6.75h11M5.5 2v2.5M10.5 2v2.5" />
  </Icon>
);

export const ChecklistIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="m2.5 4.5 1.25 1.25L6 3.25M2.5 10.75 3.75 12 6 9.5M8.5 4.75h5M8.5 11h5" />
  </Icon>
);

export const NotesIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M3 4h10M3 8h10M3 12h6" />
  </Icon>
);

export const TrashIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M2.75 4.25h10.5M6.25 4V2.75h3.5V4M4.25 4.25l.6 9h6.3l.6-9" />
  </Icon>
);

export const SunIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05" />
  </Icon>
);

export const MoonIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M13.25 9.6A5.75 5.75 0 0 1 6.4 2.75a5.75 5.75 0 1 0 6.85 6.85Z" />
  </Icon>
);

const SolidIcon = ({ size = 14, children }: { size?: number; children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    {children}
  </svg>
);

export const PlayIcon = ({ size }: IconProps) => (
  <SolidIcon size={size}>
    <path d="M5 3.3c0-.8.9-1.3 1.6-.9l6.6 4.7c.6.4.6 1.3 0 1.8l-6.6 4.7c-.7.4-1.6-.1-1.6-.9V3.3Z" />
  </SolidIcon>
);

export const StopIcon = ({ size }: IconProps) => (
  <SolidIcon size={size}>
    <rect x="3.5" y="3.5" width="9" height="9" rx="2" />
  </SolidIcon>
);

export const ClockIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 4.75V8l2.25 1.5" />
  </Icon>
);

export const PinIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="M9.75 2.25 13.75 6.25M10.75 3.25 7 5.5 4.75 5.25 3.5 6.5l6 6 1.25-1.25L10.5 9l2.25-3.75M6.5 9.5l-3.75 3.75" />
  </Icon>
);

export const PencilIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="m10.75 2.75 2.5 2.5L5.5 13l-3 .5.5-3 7.75-7.75Z" />
  </Icon>
);

export const UserIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <circle cx="8" cy="5.25" r="2.75" />
    <path d="M2.75 13.5c.7-2.45 2.7-3.75 5.25-3.75s4.55 1.3 5.25 3.75" />
  </Icon>
);

export const CheckIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="m3.25 8.5 3.25 3.25 6.25-7" />
  </Icon>
);

export const ChevronRightIcon = ({ size }: IconProps) => (
  <Icon size={size}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </Icon>
);

export const CheckDot = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className="check-dot">
    <circle cx="9" cy="9" r="9" fill="var(--done-check)" />
    <path
      d="m5.25 9.4 2.5 2.5 5-5.6"
      fill="none"
      stroke="var(--done-check-ink)"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
