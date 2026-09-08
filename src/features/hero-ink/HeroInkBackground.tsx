"use client";

import { useEffect, useRef } from "react";
import { heroInkConfig as config } from "./config";
import { sampleStroke, nextFrameDeadline, type InkPoint } from "./stroke";
import type { InkFluid } from "./fluid";

export default function HeroInkBackground() {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const layer = layerRef.current!, canvas = canvasRef.current!, container = layer.parentElement!;
    const pointer = matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let fluid: InkFluid | null = null, disposed = false, failed = false, loading = false, intersecting = false;
    let disposeContext: (() => void) | null = null;
    let frame = 0, lastFrame = 0, nextFrame = 0, upperBound = 0;
    let previous: InkPoint | null = null;
    let pending: InkPoint[] = [];
    const eligible = () => pointer.matches && !reduced.matches && navigator.maxTouchPoints === 0;
    const visible = () => intersecting && document.visibilityState === "visible";
    const active = () => !disposed && !failed && eligible() && visible();
    const state = (value: string) => { layer.dataset.inkState = value; };
    function resetPointer() { previous = null; pending = []; }
    function stop() { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; nextFrame = 0; resetPointer(); }
    function release(loseContext = true) {
      stop(); const old = fluid; fluid = null;
      if (old) old.dispose(loseContext); else if (loseContext) disposeContext?.();
      if (loseContext) disposeContext = null;
      upperBound = 0;
    }
    function fail() { failed = true; release(); state("static"); }
    function schedule() { if (!frame && active() && fluid) frame = requestAnimationFrame(tick); }
    function tick(time: number) {
      frame = 0;
      if (!active() || !fluid) return;
      if (nextFrame && time + 0.5 < nextFrame) { schedule(); return; }
      const dt = Math.min((time - (lastFrame || time - 1000 / config.maxFps)) / 1000, 0.05);
      lastFrame = time; nextFrame = nextFrameDeadline(time, nextFrame, config.maxFps);
      try {
        if (pending.length > 1) {
          const samples = sampleStroke(pending, canvas.clientWidth / canvas.clientHeight, dt); pending = [];
          for (const sample of samples) {
            fluid.inject(sample.x, sample.y, sample.dx, sample.dy, sample.amount);
            upperBound = Math.min(1, upperBound + sample.amount);
          }
        }
        upperBound *= Math.exp(-config.dyeDissipation * dt);
        if (upperBound < config.restThreshold) {
          fluid.clear(); upperBound = 0; lastFrame = 0; nextFrame = 0; state("rest"); return;
        }
        fluid.step(dt); state("running"); schedule();
      } catch { fail(); }
    }
    async function ensure() {
      if (!active() || fluid || loading) return;
      loading = true; state("loading");
      try {
        const { createInkFluid } = await import("./fluid");
        if (!active()) return;
        fluid = createInkFluid(canvas);
        const created = fluid; disposeContext = () => created.dispose(); state("rest");
      } catch { if (!disposed) fail(); }
      finally { loading = false; }
    }
    function sync() {
      if (disposed) return;
      if (!eligible()) { release(false); state("static"); return; }
      if (!visible()) { stop(); state(failed ? "static" : "paused"); return; }
      if (failed) return;
      if (fluid) {
        try { fluid.resize(); fluid.clear(); upperBound = 0; resetPointer(); state("rest"); }
        catch { fail(); }
      } else { void ensure(); }
    }
    function move(event: PointerEvent) {
      if (!active() || !fluid || event.pointerType !== "mouse" || event.buttons) { resetPointer(); return; }
      const bounds = canvas.getBoundingClientRect();
      const events = event.getCoalescedEvents?.();
      for (const item of events?.length ? events : [event]) {
        const x = (item.clientX - bounds.left) / bounds.width, y = 1 - (item.clientY - bounds.top) / bounds.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) { resetPointer(); continue; }
        const point = { x, y, time: item.timeStamp };
        if (!previous || point.time - previous.time > 250) { pending = []; previous = point; continue; }
        if (Math.hypot(x - previous.x, y - previous.y) < 0.0001) { previous = point; continue; }
        if (!pending.length) pending.push(previous);
        pending.push(point); previous = point;
        if (pending.length > config.maxPendingPoints) pending.splice(1, pending.length - config.maxPendingPoints);
      }
      if (pending.length < 2) return;
      schedule();
    }
    function resize() { if (active() && fluid) { stop(); try { fluid.resize(); fluid.clear(); upperBound = 0; state("rest"); } catch { fail(); } } }
    function contextLost() { if (fluid && !disposed) fail(); }
    const intersection = new IntersectionObserver(entries => {
      intersecting = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0); sync();
    });
    const size = new ResizeObserver(resize);
    intersection.observe(layer); size.observe(layer);
    container.addEventListener("pointermove", move, { passive: true });
    container.addEventListener("pointerenter", resetPointer, { passive: true });
    container.addEventListener("pointerleave", resetPointer, { passive: true });
    window.addEventListener("blur", resetPointer);
    document.addEventListener("visibilitychange", sync);
    pointer.addEventListener("change", sync); reduced.addEventListener("change", sync);
    canvas.addEventListener("webglcontextlost", contextLost);
    sync();
    return () => {
      disposed = true; release(); intersection.disconnect(); size.disconnect();
      container.removeEventListener("pointermove", move); container.removeEventListener("pointerenter", resetPointer); container.removeEventListener("pointerleave", resetPointer);
      window.removeEventListener("blur", resetPointer); document.removeEventListener("visibilitychange", sync);
      pointer.removeEventListener("change", sync); reduced.removeEventListener("change", sync);
      canvas.removeEventListener("webglcontextlost", contextLost);
    };
  }, []);
  return <div ref={layerRef} className="hero-ink-background" data-ink-state="static" aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
