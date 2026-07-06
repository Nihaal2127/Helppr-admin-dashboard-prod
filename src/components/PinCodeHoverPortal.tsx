import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type PinCodeHoverPortalProps = {
  items: string[];
  children: React.ReactNode;
  /** Categories/Services use a bullet list; Area uses stacked rows */
  listStyle?: "ul" | "div";
};

/**
 * Renders the hover list in `document.body` with `position: fixed` so it appears above
 * table scroll containers, sticky headers, and scrollbars — not clipped by `overflow: auto`.
 */
export function PinCodeHoverPortal({
  items,
  children,
  listStyle = "ul",
}: PinCodeHoverPortalProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({
    top: 0,
    left: 0,
    placement: "below" as "below" | "above",
  });
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const updateAnchorFromTrigger = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const left = r.left + r.width / 2;
    const estHeight = Math.min(40 + items.length * 26, 320);
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const placeAbove = spaceBelow < estHeight && r.top > estHeight + margin;
    if (placeAbove) {
      setAnchor({ top: r.top - margin, left, placement: "above" });
    } else {
      setAnchor({ top: r.bottom + margin, left, placement: "below" });
    }
  }, [items.length]);

  const onEnterTrigger = useCallback(() => {
    clearHideTimer();
    updateAnchorFromTrigger();
    setOpen(true);
  }, [clearHideTimer, updateAnchorFromTrigger]);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      hideTimerRef.current = null;
    }, 200);
  }, [clearHideTimer]);

  const onEnterPanel = useCallback(() => {
    clearHideTimer();
  }, [clearHideTimer]);

  const onLeavePanel = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => setOpen(false);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            role="tooltip"
            className="pin-code-hover-portal-card"
            style={{
              top: anchor.top,
              left: anchor.left,
              transform:
                anchor.placement === "below"
                  ? "translate(-50%, 0)"
                  : "translate(-50%, -100%)",
            }}
            onMouseEnter={onEnterPanel}
            onMouseLeave={onLeavePanel}
          >
            {listStyle === "ul" ? (
              <ul className="mb-0 ps-3" style={{ margin: 0 }}>
                {items.map((label, idx) => (
                  <li key={`${label}-${idx}`}>{label}</li>
                ))}
              </ul>
            ) : (
              items.map((label, idx) => (
                <div key={`${label}-${idx}`} className="pin-code-hover-item">
                  {label}
                </div>
              ))
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div
        ref={triggerRef}
        className="pin-code-hover-wrapper pin-code-hover-wrapper--fill"
        onMouseEnter={onEnterTrigger}
        onMouseLeave={scheduleHide}
      >
        {children}
      </div>
      {panel}
    </>
  );
}
