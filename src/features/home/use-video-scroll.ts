"use client";
import { useEffect, type RefObject } from 'react';
import { clamp, homeConfig, sceneOpacities } from './config';
import { FrameBank } from './frame-bank';
import manifest from './frames-manifest.json';
export function useVideoScroll(rootRef: RefObject<HTMLDivElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current;
    if (!root || !canvas) return;
    const query = matchMedia(homeConfig.mediaQuery);
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean; effectiveType?: string; downlink?: number; rtt?: number } }).connection;
    const constrained = () => !!connection && (connection.saveData === true || ['slow-2g', '2g'].includes(connection.effectiveType || ''));
    const scenes = Array.from(root.querySelectorAll<HTMLElement>('.home-chapter'));
    const navigation = root.querySelector<HTMLElement>('.home-navigation')!;
    let frame = 0, previous = 0, current = 0, target = 0, top = 0, span = 1;
    let enabled = false, visible = true, disposed = false, failed = false;
    let bank: FrameBank | null = null, timeout = 0, started = 0;
    function stop() { cancelAnimationFrame(frame); frame = 0; previous = 0; }
    function release() { clearTimeout(timeout); stop(); bank?.dispose(); bank = null; }
    function paint(progress: number) {
      const opacities = sceneOpacities(progress);
      scenes.forEach((scene, index) => {
        const opacity = opacities[index];
        scene.style.opacity = String(opacity);
        scene.inert = opacity < 0.3;
        scene.setAttribute("aria-hidden", String(opacity < 0.3));
        scene.dataset.visible = String(opacity >= 0.3);
        scene.dataset.present = String(opacity > 0);
      });
      navigation.hidden = progress < 0.3;
      const chapter = progress < 0.3 ? 0 : progress < 0.65 ? 1 : 2;
      root!.querySelectorAll<HTMLElement>("[data-chapter-link]").forEach(button => {
        if (Number(button.dataset.chapterLink) === chapter) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
      });
      root!.dataset.chapter = String(chapter + 1);
      root!.dataset.light = String(progress > 0.55);
      root!.style.setProperty("--home-progress", String(progress));
    }
    function staticNavigation() {
      let chapter = 0;
      scenes.forEach((scene, i) => { if (scene.getBoundingClientRect().top <= innerHeight * .5) chapter = i; });
      root!.dataset.chapter = String(chapter + 1);
      const navbar = root!.querySelector<HTMLElement>(".home-navbar");
      const navTextY = navbar ? navbar.offsetHeight - 46 : 64;
      root!.dataset.light = String(scenes[2].getBoundingClientRect().top <= navTextY);
      root!.querySelectorAll<HTMLElement>("[data-chapter-link]").forEach(button => {
        if (Number(button.dataset.chapterLink) === chapter) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
      });
    }
    function measure() {
      top = root!.getBoundingClientRect().top + scrollY;
      span = Math.max(1, root!.offsetHeight - innerHeight);
      target = clamp((scrollY - top) / span);
    }
    function tick(now: number) {
      frame = 0;
      if (!enabled || disposed || !visible || document.hidden || !bank) return;
      const dt = previous ? Math.min((now - previous) / 1000, .1) : 1 / 60;
      previous = now;
      current += (target - current) * (1 - Math.exp(-dt * homeConfig.smoothing));
      if (Math.abs(target - current) * manifest.duration < homeConfig.snap) current = target;
      paint(target);
      try {
        const drawn = bank.draw(current * manifest.duration);
        if (drawn !== null) {
          clearTimeout(timeout);
          if (root!.dataset.renderer !== 'canvas') root!.dataset.firstFrameMs = String(performance.now() - started);
          root!.dataset.renderer = 'canvas'; root!.dataset.videoState = 'ready'; root!.dataset.bankState = 'ready';
        }
      } catch { fail(); }
      if (enabled && current !== target) frame = requestAnimationFrame(tick); else previous = 0;
    }
    function wake() { if (enabled && !disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(tick); }
    function scroll() { if (!enabled) { staticNavigation(); return; } target = clamp((scrollY - top) / span); wake(); }
    function staticMode() {
      enabled = false; release();
      root!.dataset.mode = 'static'; root!.dataset.renderer = 'poster';
      root!.dataset.videoState = failed ? 'unavailable' : 'static'; root!.dataset.bankState = 'static';
      scenes.forEach(scene => { scene.style.removeProperty('opacity'); scene.inert = false; scene.removeAttribute('aria-hidden'); scene.dataset.visible = 'true'; scene.dataset.present = 'true'; });
      navigation.hidden = true; staticNavigation();
    }
    function fail() {
      if (!enabled || disposed) return;
      failed = true;
      const chapter = target >= .67 ? 2 : target >= .32 ? 1 : 0;
      staticMode(); if (chapter > 0) scenes[chapter].scrollIntoView({ behavior: 'instant' });
    }
    function configure() {
      const shouldEnable = query.matches && navigator.maxTouchPoints === 0 && 'createImageBitmap' in window && !constrained() && !failed;
      if (shouldEnable === enabled) { measure(); if (!enabled) staticNavigation(); wake(); return; }
      const chapter = Number(root!.dataset.chapter || 1) - 1;
      if (!shouldEnable) { staticMode(); if (chapter > 0) scenes[chapter].scrollIntoView({ behavior: 'instant' }); return; }
      enabled = true; started = performance.now();
      root!.dataset.mode = 'cinematic'; root!.dataset.videoState = 'loading'; root!.dataset.renderer = 'poster'; root!.dataset.bankState = 'loading';
      root!.dataset.bankFrames = String(manifest.frames.length);
      measure(); current = target; paint(current);
      try {
        canvas!.width = manifest.width; canvas!.height = manifest.height;
        bank = new FrameBank(canvas!, manifest.frames, wake, fail);
        bank.pause(document.hidden || !visible);
        timeout = window.setTimeout(() => { if (!document.hidden && visible) fail(); }, 5000);
        wake();
      } catch { fail(); }
    }
    function visibility() {
      bank?.pause(document.hidden || !visible);
      clearTimeout(timeout);
      if (document.hidden || !visible) stop();
      else { measure(); if (enabled && root!.dataset.videoState === 'loading') timeout = window.setTimeout(fail, 5000); wake(); }
    }
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; visibility(); });
    observer.observe(root);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', configure);
    document.addEventListener('visibilitychange', visibility);
    query.addEventListener('change', configure); connection?.addEventListener('change', configure);
    configure();
    return () => {
      disposed = true; enabled = false; observer.disconnect();
      window.removeEventListener('scroll', scroll); window.removeEventListener('resize', configure);
      document.removeEventListener('visibilitychange', visibility); query.removeEventListener('change', configure); connection?.removeEventListener('change', configure);
      release();
    };
  }, [rootRef, canvasRef]);
}
