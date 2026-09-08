import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homeConfig } from '../src/features/home/config.ts';

export async function attachOriginalVideo(context) {
  const path = process.env.WHITESPACE_VIDEO_FIXTURE;
  if (!path) return { source: 'live-CDN' };
  const bytes = await readFile(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== 'b702ba81cde6756eb2a885d3e2d647784fa2909d42961c912c14985b35d27e73') throw new Error('Video fixture does not match the original');
  await context.route(homeConfig.video, route => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    return route.fulfill({ status: range ? 206 : 200, body: bytes.subarray(start, end + 1), headers: { 'content-type': 'video/mp4', 'access-control-allow-origin': '*', 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${bytes.length}` } : {}) } });
  });
  return { source: 'cached-original-video', sha256, bytes: bytes.length };
}
