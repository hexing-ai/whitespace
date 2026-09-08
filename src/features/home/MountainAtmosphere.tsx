"use client";

import { useEffect, useRef } from "react";

/** Original vector landscape. No image requests, canvas, frame loop or scroll handler. */
export function MountainAtmosphere() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !("IntersectionObserver" in window)) return;
    let visible = false;
    const update = () => { element.dataset.active = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      element.dataset.active = "false";
    };
  }, []);

  return <div ref={root} className="home-atmosphere" data-active="false" aria-hidden="true">
    <svg className="home-mountains" viewBox="0 0 1440 700" preserveAspectRatio="xMidYMax slice" focusable="false">
      <defs>
        <linearGradient id="home-ridge-far" x2="0" y2="1"><stop stopColor="#abbcc5" stopOpacity=".5" /><stop offset="1" stopColor="#dce5e8" stopOpacity=".2" /></linearGradient>
        <linearGradient id="home-ridge-mid" x2="0" y2="1"><stop stopColor="#647f92" stopOpacity=".48" /><stop offset="1" stopColor="#cbd9df" stopOpacity=".12" /></linearGradient>
        <linearGradient id="home-ridge-near" x2="0" y2="1"><stop stopColor="#294d65" stopOpacity=".55" /><stop offset="1" stopColor="#a9bfc9" stopOpacity=".14" /></linearGradient>
      </defs>
      <path fill="url(#home-ridge-far)" d="M0 390 90 359 169 377 253 318 306 337 411 278 465 304 554 238 592 259 696 188 728 201 784 162 824 193 871 180 929 228 1003 209 1081 278 1157 241 1254 305 1347 269 1440 312V700H0Z" />
      <path fill="url(#home-ridge-mid)" d="M0 499 90 460 149 472 245 429 313 451 388 399 436 418 511 367 569 385 653 327 696 350 768 300 816 325 879 280 917 301 981 256 1035 300 1084 281 1143 327 1197 308 1277 365 1353 331 1440 379V700H0Z" />
      <path fill="url(#home-ridge-near)" d="M0 601 112 560 209 587 309 549 406 571 511 519 589 546 686 493 744 512 848 448 902 471 970 418 1011 430 1075 390 1121 414 1190 372 1249 400 1309 365 1375 410 1440 394V700H0Z" />
    </svg>
    <div className="home-fog home-fog-far" />
    <div className="home-fog home-fog-near" />
  </div>;
}
