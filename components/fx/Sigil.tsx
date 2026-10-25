import type { ReactElement } from "react";
import { ELEMENT_HEX, type Element } from "./types";

export type SigilProps = { element: Element; size?: number; className?: string; title?: string };

/* 24×24 stroke glyphs. Colour comes from the element (inline), size from `size`. */
const GLYPH: Record<Element, ReactElement> = {
  fire: (
    <>
      <path d="M12 2.6c1 4.6 5 6.4 5 11.4a5 5 0 0 1-10 0c0-2.6 1.3-4.2 2.6-5.7.4 1.6 1.2 2.6 2.4 3 0-2.6-1-4.3 0-8.7Z" />
      <path d="M12 20.4a2.3 2.3 0 0 1-2.3-2.3c0-1.3.9-2.1 2.3-3.6 1.4 1.5 2.3 2.3 2.3 3.6a2.3 2.3 0 0 1-2.3 2.3Z" fill="currentColor" stroke="none" opacity=".9" />
    </>
  ),
  water: (
    <>
      <path d="M12 2.8C9.2 7.6 6 10.6 6 15a6 6 0 0 0 12 0c0-4.4-3.2-7.4-6-12.2Z" />
      <path d="M8.6 15.4c1-1.1 2.4-1.1 3.4 0s2.4 1.1 3.4 0" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8.5h9.5a2.5 2.5 0 1 0-2.4-3.2" />
      <path d="M3 13.5h14.5a2.6 2.6 0 1 1-2.5 3.3" />
      <path d="M3 18.5h7.5" />
    </>
  ),
  shadow: (
    <>
      <path d="M14.5 3a9 9 0 1 0 6.5 15.2A8 8 0 0 1 14.5 3Z" />
      <circle cx="6" cy="6" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  light: (
    <>
      <path d="M12 2.5l2.1 7.4L21.5 12l-7.4 2.1L12 21.5l-2.1-7.4L2.5 12l7.4-2.1Z" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
};

/** Element glyph in the element colour (replaces the emoji). */
export default function Sigil({ element, size = 20, className = "", title }: SigilProps) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={title ?? element}
      className={`inline-block shrink-0 align-middle ${className}`} style={{ color: ELEMENT_HEX[element] }}
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      {GLYPH[element]}
    </svg>
  );
}
