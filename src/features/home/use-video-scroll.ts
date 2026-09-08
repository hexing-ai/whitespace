"use client";

import { useEffect, type RefObject } from "react";
import { clamp, homeConfig, sceneOpacities } from "./config";
import { FrameBank } from "./frame-bank";
import type { FrameBankMessage } from "./frame-types";

export function useVideoScroll(rootRef: RefObject<HTMLDivElement | null>, videoRef: RefObject<HTMLVideoElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const root = rootRef.current, video = videoRef.current, canvas = canvasRef.current;
    if (!root || !video || !canvas) return;
    const query = matchMedia(homeConfig.mediaQuery);
    const scenes = Array.from(root.querySelectorAll<HTMLElement>(".home-chapter"));
    const navigation = root.querySelector<HTMLElement>(".home-navigation")!;
    let frame = 0, timeout = 0, seekTimeout = 0, previous = 0, current = 0, target = 0;
    let enabled = false, visible = true, disposed = false, failed = false, videoFailed = false;
    let top = 0, span = 1;
    let worker: Worker | null = null, bank: FrameBank | null = null, bankDuration = 0, decodeTimeout = 0;

    function stop() { cancelAnimationFrame(frame); frame = 0; previous = 0; }
    function release() {
      stopWorker(); bank?.dispose(); bank = null; bankDuration = 0;
      root!.dataset.renderer = "video";
      clearTimeout(timeout); clearTimeout(seekTimeout); stop(); video!.pause(); video!.removeAttribute("src"); video!.load();
    }
    function stopWorker() {
      clearTimeout(decodeTimeout);
      if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); worker = null; }
    }
    function revertFrames() {
      stopWorker(); bank?.dispose(); bank = null; bankDuration = 0;
      root!.dataset.bankState = "fallback"; root!.dataset.renderer = "video";
      if (videoFailed || video!.error) { fail(); return; }
      wake();
    }
    function buildFrames() {
      if (!enabled || disposed || worker || bank) return;
      if (!("VideoDecoder" in window) || !("OffscreenCanvas" in window) || !("Worker" in window) || !("createImageBitmap" in window)) {
        root!.dataset.bankState = "unsupported"; return;
      }
      root!.dataset.bankState = "building";
      try {
        worker = new Worker(new URL("./frame-worker.ts", import.meta.url));
        worker.onmessage = (event: MessageEvent<FrameBankMessage>) => {
          if (!enabled || disposed) return;
          const message = event.data;
          if (message.type === "retry") { root!.dataset.acceleration = "prefer-software"; root!.dataset.decoderRetry = message.reason; return; }
          if (message.type === "error") { root!.dataset.bankError = message.reason; revertFrames(); return; }
          stopWorker();
          try {
            canvas!.width = message.width; canvas!.height = message.height;
            bank = new FrameBank(canvas!, message.frames, wake, revertFrames);
            bankDuration = message.duration;
            root!.dataset.bankState = "ready";
            root!.dataset.acceleration = message.acceleration;
            root!.dataset.bankFrames = String(message.frames.length);
            root!.dataset.bankBytes = String(message.compressedBytes);
            root!.dataset.bankBuildMs = String(message.buildMs);
            root!.dataset.bankDownloadMs = String(message.downloadMs);
            root!.dataset.bankDecodeMs = String(message.decodeMs);
            root!.dataset.peakDecodeFrames = String(message.peakFrames);
            clearTimeout(seekTimeout); clearTimeout(timeout); wake();
          } catch { revertFrames(); }
        };
        worker.onerror = event => { event.preventDefault(); revertFrames(); };
        worker.postMessage({ type: "build", url: homeConfig.video });
        worker.postMessage({ type: "pause", value: document.hidden || !visible });
        decodeTimeout = window.setTimeout(revertFrames, homeConfig.decodeTimeout);
      } catch { revertFrames(); }
    }
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
    function measure() {
      top = root!.getBoundingClientRect().top + window.scrollY;
      span = Math.max(1, root!.offsetHeight - window.innerHeight);
      target = clamp((window.scrollY - top) / span);
    }
    function tick(now: number) {
      frame = 0;
      if (!enabled || disposed || !visible || document.hidden) return;
      const dt = previous ? Math.min((now - previous) / 1000, 0.1) : 1 / 60;
      previous = now;
      current += (target - current) * (1 - Math.exp(-dt * homeConfig.smoothing));
      const duration = bankDuration || video!.duration;
      if (Math.abs(target - current) * (Number.isFinite(duration) ? duration : 1) < homeConfig.snap) current = target;
      paint(target);
      if (bank) {
        try {
          const drawn = bank.draw(current * duration);
          if (drawn !== null) { root!.dataset.renderer = "canvas"; root!.dataset.videoState = "ready"; }
        } catch { revertFrames(); }
      } else if (Number.isFinite(duration) && duration > 0 && video!.readyState >= 2) {
        const end = Math.max(0, duration - 0.05);
        const time = current * end;
        if (!video!.seeking && Math.abs(video!.currentTime - time) > 0.016) video!.currentTime = time;
      }
      if (current !== target) frame = requestAnimationFrame(tick);
      else previous = 0;
    }
    function wake() {
      if (enabled && !disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(tick);
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
    function scroll() {
      if (!enabled) { staticNavigation(); return; }
      target = clamp((window.scrollY - top) / span); wake();
    }
    function staticMode() {
      enabled = false; release();
      root!.dataset.mode = "static";
      root!.dataset.videoState = failed ? "unavailable" : "static";
      root!.dataset.bankState = "static";
      scenes.forEach(scene => { scene.style.removeProperty("opacity"); scene.inert = false; scene.removeAttribute("aria-hidden"); scene.dataset.visible = "true"; scene.dataset.present = "true"; });
      navigation.hidden = true; staticNavigation();
    }
    function configure() {
      const shouldEnable = query.matches && navigator.maxTouchPoints === 0 && !failed;
      if (shouldEnable === enabled) { measure(); if (!enabled) staticNavigation(); wake(); return; }
      const chapter = Number(root!.dataset.chapter || 1) - 1;
      if (!shouldEnable) {
        staticMode();
        if (chapter > 0) scenes[chapter].scrollIntoView({ behavior: "instant" });
        return;
      }
      enabled = true; root!.dataset.mode = "cinematic"; root!.dataset.videoState = "loading";
      videoFailed = false;
      measure(); current = target; paint(current);
      video!.src = homeConfig.video;
      video!.load();
      timeout = window.setTimeout(fail, homeConfig.loadTimeout);
      if (document.readyState === "complete") buildFrames();
      wake();
    }
    function fail() {
      if (!enabled || disposed || bank) return;
      if (worker) {
        videoFailed = true;
        clearTimeout(timeout); clearTimeout(seekTimeout);
        video!.pause(); video!.removeAttribute("src"); video!.load();
        root!.dataset.videoState = "loading";
        return;
      }
      failed = true;
      const chapter = target >= 0.67 ? 2 : target >= 0.32 ? 1 : 0;
      staticMode();
      if (chapter > 0) scenes[chapter].scrollIntoView({ behavior: "instant" });
    }
    function loaded() {
      if (!enabled) return;
      clearTimeout(timeout); root!.dataset.videoState = "ready"; wake();
    }
    function seeked() {
      clearTimeout(seekTimeout);
      if (enabled && !bank) wake();
    }
    function seeking() {
      clearTimeout(seekTimeout);
      if (enabled && !bank) seekTimeout = window.setTimeout(fail, homeConfig.seekTimeout);
    }
    function visibility() {
      worker?.postMessage({ type: "pause", value: document.hidden || !visible });
      if (document.hidden) stop(); else { measure(); wake(); }
    }
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      worker?.postMessage({ type: "pause", value: document.hidden || !visible });
      if (visible) wake(); else stop();
    });
    observer.observe(root);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("load", buildFrames);
    window.addEventListener("resize", configure);
    window.addEventListener("orientationchange", configure);
    document.addEventListener("visibilitychange", visibility);
    query.addEventListener("change", configure);
    video.addEventListener("loadeddata", loaded);
    video.addEventListener("seeked", seeked);
    video.addEventListener("seeking", seeking);
    video.addEventListener("error", fail);
    configure();
    return () => {
      disposed = true; enabled = false;
      observer.disconnect();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("load", buildFrames);
      window.removeEventListener("resize", configure);
      window.removeEventListener("orientationchange", configure);
      document.removeEventListener("visibilitychange", visibility);
      query.removeEventListener("change", configure);
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("seeked", seeked);
      video.removeEventListener("seeking", seeking);
      video.removeEventListener("error", fail);
      release();
    };
  }, [rootRef, videoRef, canvasRef]);
}
