"use client";

import { useEffect, type RefObject } from "react";
import { FrameBank } from "./frame-bank";
import { homeConfig } from "./config";
import manifest from "./frames-manifest.json";
import preview from "./preview-manifest.json";

/** Only the decorative canvas follows scroll. Never move, hide or pin the document. */
export function useScrollLandscape(rootRef: RefObject<HTMLDivElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current;
    if (!root || !canvas) return;
    const query = matchMedia(homeConfig.mediaQuery);
    let bank: FrameBank | null = null, raf = 0, timeout = 0, settle = 0, lastScroll = -Infinity;
    let top = 0, span = 1, visible = true, disposed = false, failed = false;
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    let saveData = Boolean(connection?.saveData);
    function connectionChange() {
      // Network estimates change while idle; only a data-saving preference affects rendering.
      const next = Boolean(connection?.saveData);
      if (next !== saveData) { saveData = next; configure(); }
    }
    const measure = () => { top = root.getBoundingClientRect().top + scrollY; span = Math.max(1, root.offsetHeight - innerHeight); };
    function stop() { cancelAnimationFrame(raf); raf = 0; clearTimeout(timeout); clearTimeout(settle); }
    function release() { stop(); bank?.dispose(); bank = null; }
    function fallback() {
      failed = true; release(); root!.dataset.renderer = "poster"; root!.dataset.light = "false";
      root!.dataset.landscape = "unavailable";
    }
    function tick() {
      raf = 0;
      if (!bank || disposed || !visible || document.hidden) return;
      const progress = Math.max(0, Math.min(1, (scrollY - top) / span));
      try {
        const drawn = bank.draw(progress * manifest.frames[manifest.frames.length - 1].ts / 1e6, performance.now() - lastScroll >= 120);
        if (drawn !== null) {
          clearTimeout(timeout);
          root!.dataset.renderer = "canvas"; root!.dataset.landscape = "ready";
          // Contrast follows the frame actually on screen, including delayed or reverse seeks.
          root!.dataset.light = String(Number(canvas!.dataset.frame) >= homeConfig.lightFrame);
        }
      } catch { fallback(); }
    }
    function wake() { if (bank && !disposed && visible && !document.hidden && !raf) raf = requestAnimationFrame(tick); }
    function scroll() {
      root!.dataset.scrolled = String(scrollY > top + 8);
      lastScroll = performance.now(); wake(); clearTimeout(settle);
      settle = window.setTimeout(wake, 120);
    }
    function visibility() {
      bank?.pause(!visible || document.hidden); stop();
      if (bank && visible && !document.hidden) {
        if (root!.dataset.landscape === "loading") timeout = window.setTimeout(fallback, homeConfig.loadTimeout);
        wake();
      }
    }
    function configure() {
      measure();
      root!.dataset.scrolled = String(scrollY > top + 8);
      const enable = query.matches && navigator.maxTouchPoints === 0 && "createImageBitmap" in window && !connection?.saveData && !failed;
      if (!enable) {
        release(); root!.dataset.renderer = "poster"; root!.dataset.light = "false";
        root!.dataset.landscape = failed ? "unavailable" : "static";
        return;
      }
      if (!bank) {
        canvas!.width = manifest.width; canvas!.height = manifest.height;
        root!.dataset.landscape = "loading";
        try { bank = new FrameBank(canvas!, manifest.frames, wake, fallback, preview); } catch { fallback(); return; }
        visibility();
      }
      wake();
    }
    const observer = "IntersectionObserver" in window ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visibility(); }) : null;
    observer?.observe(root);
    const sizeObserver = "ResizeObserver" in window ? new ResizeObserver(() => { measure(); wake(); }) : null;
    sizeObserver?.observe(root);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", configure);
    document.addEventListener("visibilitychange", visibility);
    query.addEventListener("change", configure); connection?.addEventListener("change", connectionChange);
    configure();
    return () => {
      disposed = true; observer?.disconnect(); sizeObserver?.disconnect(); release();
      window.removeEventListener("scroll", scroll); window.removeEventListener("resize", configure);
      document.removeEventListener("visibilitychange", visibility);
      query.removeEventListener("change", configure); connection?.removeEventListener("change", connectionChange);
    };
  }, [rootRef, canvasRef]);
}
