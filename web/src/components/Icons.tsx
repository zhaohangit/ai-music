import type { SVGProps } from "react";

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const Play = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M8 5v14l11-7z" />
  </svg>
);
export const Pause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </svg>
);
export const Prev = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M6 6h2v12H6zM20 6v12L9.5 12z" />
  </svg>
);
export const Next = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M16 6h2v12h-2zM4 6v12l10.5-6z" />
  </svg>
);
export const Download = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3" />
  </svg>
);
export const Trash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
export const Refresh = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
  </svg>
);
export const Reuse = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 12V8a2 2 0 0 1 2-2h12M4 12l3-3m-3 3 3 3M20 12v4a2 2 0 0 1-2 2H6m14-6-3-3m3 3-3 3" />
  </svg>
);
export const Sparkle = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 13 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
  </svg>
);
export const Music = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);
export const Library = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4-1v16l-4 1z" />
  </svg>
);
export const X = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);
export const Chevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
export const Alert = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 9v4m0 4h.01M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
);
export const Gear = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
export const Spinner = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} className={`animate-spin ${p.className ?? ""}`}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);
export const Lock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
export const Search = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </svg>
);
export const Extend = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 12h14m-4-4 4 4-4 4M4 7v10" />
  </svg>
);
export const Cover = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 8a7 7 0 1 1 0 8M5 8V4m0 4h4" />
    <path d="M10 10v6l5-3-5-3Z" />
  </svg>
);
export const Remaster = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 17V7m5 13V4m6 13V7m5 13V4" />
    <path d="M2 10h4m1 5h4m2-5h4m1 5h4" />
  </svg>
);
export const Volume = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="M16 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12" />
  </svg>
);
export const VolumeOff = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 9v6h4l5 4V5L8 9H4Zm12 1 5 5m0-5-5 5" />
  </svg>
);
export const Copy = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);
export const Home = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m3 11 9-8 9 8" />
    <path d="M5 10v10h14V10M9 20v-6h6v6" />
  </svg>
);
export const PenLine = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
  </svg>
);
export const Folder = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>
);
export const ListTodo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m3 6 2 2 3-4M11 6h10M3 13l2 2 3-4M11 13h10M3 20l2 2 3-4M11 20h10" />
  </svg>
);
export const Wallet = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2Z" />
    <path d="M4 8h16M16 13h5v4h-5a2 2 0 0 1 0-4Z" />
  </svg>
);
export const User = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
export const LogOut = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
  </svg>
);
export const Sun = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const Moon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
  </svg>
);
export const Menu = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
export const Plus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const ArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </svg>
);
export const Wand = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m15 4 5 5L8 21l-5-5Z" />
    <path d="m14 5 5 5M6 4v3M4.5 5.5h3M18 15v4M16 17h4" />
  </svg>
);
export const Languages = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 5h7M7.5 3v2M5 9c2.5 3 5 4.5 8 5.5M11 5c-.7 4.5-3.3 7.5-7 9" />
    <path d="m13 20 4-10 4 10m-6.8-3h5.6" />
  </svg>
);
export const Quote = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 11H4a5 5 0 0 1 5-5v11a2 2 0 0 1-2 2H5M20 11h-5a5 5 0 0 1 5-5v11a2 2 0 0 1-2 2h-2" />
  </svg>
);
export const History = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </svg>
);
export const Check = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m5 12 4 4L19 6" />
  </svg>
);
export const Eye = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);
export const Crown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m3 7 4 4 5-7 5 7 4-4-2 11H5Z" />
    <path d="M5 21h14" />
  </svg>
);
export const Shield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3 4 6v6c0 5 3.4 8.2 8 9 4.6-.8 8-4 8-9V6Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
export const More = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);
export const Album = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 3v3M21 12h-3M12 21v-3M3 12h3" />
  </svg>
);
export const Compass = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" />
  </svg>
);
export const Flame = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 22c4.2 0 7-2.7 7-6.6 0-3.2-1.8-5.4-4.3-7.6.1 2-1 3.2-2.2 3.8.2-3.8-1.6-6.9-4.3-8.6.2 3.4-3.2 5.6-3.2 10.3C5 18.8 7.8 22 12 22Z" />
  </svg>
);
export const Cpu = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 9h6v6H9zM9 1v3m6-3v3m0 16v3m-6-3v3M1 9h3m-3 6h3m16-6h3m-3 6h3" />
  </svg>
);
export const Receipt = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 3h12v19l-3-2-3 2-3-2-3 2Z" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </svg>
);
export const Clock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const Sliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6h10M18 6h2M4 12h2m4 0h10M4 18h7m4 0h5" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="13" cy="18" r="2" />
  </svg>
);
export const Bell = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
  </svg>
);
export const External = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M14 4h6v6M20 4 10 14" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);
export const Shuffle = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 6h2.5c3.7 0 5.3 12 9 12H21" />
    <path d="m18 15 3 3-3 3M3 18h2.5c1.2 0 2.1-1.1 2.8-2.4M14.2 8.4C14.9 7 15.6 6 17 6h4" />
    <path d="m18 3 3 3-3 3" />
  </svg>
);
export const Repeat = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4" />
    <path d="M21 13v3a2 2 0 0 1-2 2H3" />
  </svg>
);
export const Heart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M20.8 8.8c0 5.5-8.8 10.2-8.8 10.2S3.2 14.3 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z" />
  </svg>
);
export const ListMusic = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 6h12M9 12h12M9 18h8" />
    <path d="M5 6h.01M5 12h.01M5 18h.01" />
  </svg>
);
export const Layers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
  </svg>
);
export const FileAudio = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M8 16a2 2 0 1 0 4 0v-5h4" />
  </svg>
);
export const Maximize = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 3H3v5M3 3l6 6M16 3h5v5M21 3l-6 6M8 21H3v-5M3 21l6-6M16 21h5v-5M21 21l-6-6" />
  </svg>
);
export const ChevronUp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m6 15 6-6 6 6" />
  </svg>
);
export const ChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const Film = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M10 8l5 4-5 4z"/></svg>
);
