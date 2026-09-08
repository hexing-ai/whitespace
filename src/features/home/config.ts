export const homeConfig = {
  video: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260821_114821_a8ca298f-be2c-4613-a4dd-51b69e16bbde.mp4",
  poster: "/media/whitespace-mountains.webp",
  mediaQuery: "(min-width: 1024px) and (min-height: 700px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
  smoothing: 8,
  snap: 0.002,
  loadTimeout: 15000,
  seekTimeout: 8000,
  decodeTimeout: 60000,
  bitmapLimit: 24,
  decodeLead: 24,
  bitmapConcurrency: 4,
  webpQuality: 0.82,
  chapters: [0, 0.45, 0.9],
} as const;

export const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function sceneOpacities(progress: number) {
  const p = clamp(progress);
  return [clamp(1 - (p - 0.20) / 0.08), Math.min(clamp((p - 0.32) / 0.08), clamp(1 - (p - 0.55) / 0.08)), clamp((p - 0.67) / 0.08)];
}
