// Icons — consistent 16×16 SVG, 1.5px stroke, round caps/joins
// Style: minimal, monochrome, Lucide-inspired
// All icons accept an optional class name for CSS sizing

export type IconFn = (cls?: string) => string;

function s(cls: string | undefined, def = 'icon'): string {
  return cls ? `icon ${cls}` : def;
}

// ── Core UI ────────────────────────────────────────────────

export const IconClose: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;

export const IconMoon: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 10.5A6 6 0 015.5 3.5 6 6 0 1012.5 10.5z"/></svg>`;

export const IconSun: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v1.5M8 13.5V15M3.1 3.1l1 1M11.9 11.9l1 1M1 8h1.5M13.5 8H15M3.1 12.9l1-1M11.9 4.1l1-1"/></svg>`;

export const IconChevronDown: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>`;

export const IconChevronUp: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10L8 6 4 10"/></svg>`;

export const IconSearch: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="6.5" r="4"/><path d="M9.5 9.5L14 14"/></svg>`;

// ── Actions ─────────────────────────────────────────────────

export const IconSend: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8l11-5-5 11-2-4-4-2z"/><path d="M8 10l2-2"/></svg>`;

export const IconMic: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="1" width="4" height="8" rx="2"/><path d="M3 7v1a5 5 0 0010 0V7M8 13v2"/></svg>`;

export const IconStop: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>`;

export const IconCopy: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M2 11V3a1 1 0 011-1h8"/></svg>`;

export const IconRefresh: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 4.5A6 6 0 003 8M2.5 11.5A6 6 0 0013 8"/><path d="M13.5 1v3.5H10M2.5 15v-3.5H6"/></svg>`;

export const IconDownload: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1v9M4 6l4 4 4-4M2 12v1.5A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5V12"/></svg>`;

export const IconCheck: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8l4 4 8-8"/></svg>`;

// ── Toolbar ─────────────────────────────────────────────────

export const IconDoc: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.5v11A1.5 1.5 0 004.5 15h7a1.5 1.5 0 001.5-1.5v-9L9 1H4.5A1.5 1.5 0 003 2.5z"/><path d="M9 1v4h4"/><path d="M5.5 8h5M5.5 11h5"/></svg>`;

export const IconList: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h9M4 8h9M4 12h9"/><circle cx="2" cy="4" r=".75" fill="currentColor"/><circle cx="2" cy="8" r=".75" fill="currentColor"/><circle cx="2" cy="12" r=".75" fill="currentColor"/></svg>`;

export const IconBarChart: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13V8M8 13V5M12 13v-3"/><path d="M2 13h12"/></svg>`;

export const IconHeadphones: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v1a2 2 0 01-2 2H.5V8H1a2 2 0 012 2zM13 9v1a2 2 0 002 2h.5V8H15a2 2 0 00-2 2z"/><path d="M3 9V6a5 5 0 0110 0v3"/></svg>`;

export const IconTrash: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5 4V2.5A1.5 1.5 0 016.5 1h3A1.5 1.5 0 0111 2.5V4"/><path d="M12.5 4l-.5 9.5a1.5 1.5 0 01-1.5 1.4H5.5A1.5 1.5 0 014 13.5L3.5 4"/></svg>`;

export const IconSettings: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v1.5M8 13.5V15"/><path d="M3.1 3.1l1 1M11.9 11.9l1 1"/><path d="M1 8h1.5M13.5 8H15"/><path d="M3.1 12.9l1-1M11.9 4.1l1-1"/></svg>`;

export const IconContext: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`;

export const IconSparkles: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1l1 2.5L11.5 4 9 5.5 8 8 7 5.5 4.5 4 7 3.5 8 1z"/><path d="M12 9l.8 1.2L14 11l-1.2.8L12 13l-.8-1.2L10 11l1.2-.8L12 9zM4 10l.5.8L5.5 11l-.8.5L4 12l-.5-.8L2.5 11l1-.5L4 10z"/></svg>`;

export const IconWarning: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5L1 14h14L8 1.5z"/><path d="M8 5.5v3.5M8 11.5v.5"/></svg>`;

export const IconError: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="7"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/></svg>`;

export const IconInfo: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="7"/><path d="M8 7.5V11M8 5.5v.5"/></svg>`;

export const IconAttach: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5V5a3 3 0 016 0v7.5a1.5 1.5 0 01-3 0V5"/></svg>`;

export const IconMenu: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h12M2 8h12M2 12.5h12"/></svg>`;

export const IconW: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3l2 10 4-7 4 7 2-10"/></svg>`;

export const IconArrowRight: IconFn = (cls) =>
  `<svg class="${s(cls)}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>`;

// ── Icon component helper for DOM ────────────────────────────
// Returns an SVG element (not a string) for use with insertBefore, replaceWith, etc.
export function createIcon(fn: IconFn, cls?: string): SVGSVGElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = fn(cls);
  return wrapper.firstElementChild as SVGSVGElement;
}
