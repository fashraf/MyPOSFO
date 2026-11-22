import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type TooltipSide = 'top' | 'bottom' | 'start' | 'end';

/*
 * Tooltips.
 *
 * Every bubble is drawn in a portal at the top of the page with fixed
 * coordinates, so it can never be cut off by a scrolling list, a card with
 * rounded corners, or a dialog — the "tooltip hidden behind the table" bug
 * cannot happen. It prefers the requested side, flips when there is no room,
 * and is pushed back inside the screen edge.
 */

const GAP = 8;
const MARGIN = 8;

interface Placement {
  top: number;
  left: number;
  side: TooltipSide;
  arrow: number;
}

function place(anchor: DOMRect, bubble: DOMRect, wanted: TooltipSide, rtl: boolean): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let side = wanted;
  if (side === 'start' || side === 'end') {
    const physical = (side === 'start') !== rtl ? 'left' : 'right';
    const fits = physical === 'left' ? anchor.left - bubble.width - GAP >= MARGIN : anchor.right + bubble.width + GAP <= vw - MARGIN;
    if (!fits) side = 'top';
    else {
      const left = physical === 'left' ? anchor.left - bubble.width - GAP : anchor.right + GAP;
      const top = Math.min(Math.max(anchor.top + anchor.height / 2 - bubble.height / 2, MARGIN), vh - bubble.height - MARGIN);
      return { top, left, side, arrow: anchor.top + anchor.height / 2 - top };
    }
  }
  if (side === 'top' && anchor.top - bubble.height - GAP < MARGIN) side = 'bottom';
  else if (side === 'bottom' && anchor.bottom + bubble.height + GAP > vh - MARGIN) side = 'top';
  const top = side === 'top' ? anchor.top - bubble.height - GAP : anchor.bottom + GAP;
  const centre = anchor.left + anchor.width / 2;
  const left = Math.min(Math.max(centre - bubble.width / 2, MARGIN), vw - bubble.width - MARGIN);
  return { top, left, side, arrow: centre - left };
}

/** The bubble itself. Measures, then positions, before the browser paints. */
export function TooltipBubble({
  anchor, content, side = 'top', wide = false, id,
}: { anchor: HTMLElement; content: ReactNode; side?: TooltipSide; wide?: boolean; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const rtl = document.documentElement.dir === 'rtl';
    setPos(place(anchor.getBoundingClientRect(), ref.current.getBoundingClientRect(), side, rtl));
  }, [anchor, content, side]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
      className={cn(
        'pointer-events-none fixed z-[1000] rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-medium leading-snug text-ink-50 shadow-lg',
        pos && 'animate-fade-in',
        wide ? 'w-60 text-start' : 'w-max max-w-[16rem] text-center',
      )}
    >
      {content}
      {pos && (pos.side === 'top' || pos.side === 'bottom') && (
        <span
          aria-hidden
          style={{ left: Math.min(Math.max(pos.arrow - 4, 8), (ref.current?.offsetWidth ?? 16) - 16) }}
          className={cn('absolute h-2 w-2 rotate-45 bg-ink-900', pos.side === 'top' ? '-bottom-1' : '-top-1')}
        />
      )}
    </div>,
    document.body,
  );
}

export interface TooltipProps {
  /** The explanation. Keep it to a sentence — longer belongs in an Alert. */
  content: ReactNode;
  side?: TooltipSide;
  children: ReactNode;
  className?: string;
  /** Widen for a longer sentence. */
  wide?: boolean;
}

/**
 * Shows on hover and on keyboard focus, and is wired with `aria-describedby`
 * so a screen reader gets the same explanation a sighted user does. On a touch
 * screen, a long press shows it. A tooltip supplements, never replaces.
 */
export function Tooltip({ content, side = 'top', children, className, wide = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const timer = useRef<number>();
  const anchor = useRef<HTMLSpanElement>(null);

  function show(delay = 250) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(true), delay);
  }

  function hide() {
    window.clearTimeout(timer.current);
    setVisible(false);
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <span
      ref={anchor}
      data-tip-owner=""
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => show()}
      onMouseLeave={hide}
      onFocusCapture={() => show(0)}
      onBlurCapture={hide}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') show(450);
        else hide();
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'touch') window.setTimeout(hide, 1800);
      }}
    >
      <span aria-describedby={visible ? id : undefined} className="inline-flex">
        {children}
      </span>
      {visible && anchor.current && <TooltipBubble anchor={anchor.current} content={content} side={side} wide={wide} id={id} />}
    </span>
  );
}

export interface InfoHintProps {
  content: ReactNode;
  side?: TooltipSide;
  className?: string;
  /** Accessible label for the trigger. Defaults to a generic "More information". */
  label?: string;
}

/**
 * The small circled question mark that sits beside a label. Use it where a
 * field name alone would leave someone guessing, not on every field — a page
 * of question marks explains nothing.
 */
export function InfoHint({ content, side = 'top', className, label }: InfoHintProps) {
  return (
    <Tooltip content={content} side={side} wide className={className}>
      <button
        type="button"
        tabIndex={0}
        aria-label={label ?? 'More information'}
        onClick={(event) => event.preventDefault()}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
      >
        <HelpCircle aria-hidden className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

/**
 * Automatic tooltips for the whole app, mounted once.
 *
 * Any icon-only button or link that has an `aria-label` (which every icon
 * button must have anyway, for screen readers) gets a tooltip with that same
 * text — so no icon is ever a guess, and nobody has to remember to add one.
 * `data-tip="…"` gives any other element a tooltip; native `title`
 * attributes are taken over so the browser's slow grey box never appears.
 */
export function GlobalTooltips() {
  const [target, setTarget] = useState<{ el: HTMLElement; text: string } | null>(null);
  const timer = useRef<number>();

  useEffect(() => {
    const textFor = (el: HTMLElement): string | null => {
      if (el.closest('[data-tip-owner]') || el.closest('[data-no-tip]')) return null;
      const explicit = el.getAttribute('data-tip');
      if (explicit) return explicit;
      const title = el.getAttribute('title');
      if (title) {
        el.setAttribute('data-tip', title);
        el.removeAttribute('title');
        return title;
      }
      /* Icon-only: no visible words. Screen-reader-only text does not count. */
      const hidden = [...el.querySelectorAll('.sr-only')].map((n) => n.textContent ?? '').join('');
      const visibleText = (el.textContent ?? '').replace(hidden, '').trim();
      if (visibleText) return null;
      return el.getAttribute('aria-label') || hidden.trim() || null;
    };

    const find = (start: EventTarget | null): { el: HTMLElement; text: string } | null => {
      let el = start instanceof Element ? (start.closest('[data-tip],[title],button,a,[role="button"]') as HTMLElement | null) : null;
      while (el) {
        const text = textFor(el);
        if (text) return { el, text };
        el = el.parentElement?.closest('[data-tip],[title]') as HTMLElement | null;
      }
      return null;
    };

    const open = (hit: { el: HTMLElement; text: string } | null, delay: number) => {
      window.clearTimeout(timer.current);
      if (!hit) {
        setTarget(null);
        return;
      }
      timer.current = window.setTimeout(() => setTarget(hit), delay);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      open(find(e.target), 300);
    };
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el.matches?.(':focus-visible')) return;
      open(find(el), 0);
    };
    let pressTimer: number | undefined;
    const onDown = (e: PointerEvent) => {
      window.clearTimeout(timer.current);
      setTarget(null);
      if (e.pointerType === 'touch') {
        const hit = find(e.target);
        if (hit) pressTimer = window.setTimeout(() => {
          setTarget(hit);
          window.setTimeout(() => setTarget((t) => (t?.el === hit.el ? null : t)), 1800);
        }, 450);
      }
    };
    const cancelPress = () => window.clearTimeout(pressTimer);
    const close = () => {
      window.clearTimeout(timer.current);
      setTarget(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();

    document.addEventListener('pointerover', onOver);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', close);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', cancelPress, true);
    document.addEventListener('pointercancel', cancelPress, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', close);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', cancelPress, true);
      document.removeEventListener('pointercancel', cancelPress, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  /* The element can be removed while its tooltip shows (a row deleted, a
     dialog closed); drop the bubble instead of pointing at nothing. */
  useEffect(() => {
    if (!target) return;
    const check = window.setInterval(() => {
      if (!target.el.isConnected) setTarget(null);
    }, 300);
    return () => window.clearInterval(check);
  }, [target]);

  if (!target) return null;
  return <TooltipBubble anchor={target.el} content={target.text} side="top" />;
}
