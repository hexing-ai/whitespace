import { createFile, DataStream, type Sample, type Track } from "mp4box";
import { homeConfig } from "./config";
import type { CompressedFrame, FrameBankMessage, FrameWorkerCommand } from "./frame-types";

const scope = self as unknown as { onmessage: (event: MessageEvent<FrameWorkerCommand>) => void; postMessage: (message: FrameBankMessage) => void };
let paused = false;
let resume: (() => void)[] = [];
const waitVisible = () => paused ? new Promise<void>(resolve => resume.push(resolve)) : Promise.resolve();

function demux(buffer: ArrayBuffer) {
  return new Promise<{ track: Track; samples: Sample[]; description?: ArrayBuffer }>((resolve, reject) => {
    const file = createFile();
    const samples: Sample[] = [];
    let track: Track, description: ArrayBuffer | undefined;
    file.onError = message => reject(new Error(message));
    file.onReady = info => {
      try {
        track = info.videoTracks[0];
        if (!track || !track.nb_samples) throw new Error("Missing video track");
        const entry = file.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0];
        const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
        if (box) { const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); box.write(stream); description = stream.buffer.slice(8); }
        file.setExtractionOptions(track.id, null, { nbSamples: 32 });
        file.start();
      } catch (error) { reject(error); }
    };
    file.onSamples = (_id, _user, batch) => {
      samples.push(...batch);
      if (samples.length === track.nb_samples) { file.stop(); resolve({ track, samples, description }); }
    };
    file.appendBuffer(Object.assign(buffer, { fileStart: 0 }));
    file.flush();
  });
}

async function decode(input: Awaited<ReturnType<typeof demux>>, acceleration: HardwareAcceleration) {
  const config: VideoDecoderConfig = { codec: input.track.codec, codedWidth: input.track.video.width, codedHeight: input.track.video.height, description: input.description, hardwareAcceleration: acceleration };
  if (!(await VideoDecoder.isConfigSupported(config)).supported) throw new Error("Unsupported decoder");
  const lanes = Array.from({ length: 4 }, () => {
    const surface = new OffscreenCanvas(config.codedWidth!, config.codedHeight!);
    const context = surface.getContext("2d", { alpha: false });
    if (!context) throw new Error("Missing canvas context");
    return { surface, context, encoding: Promise.resolve() };
  });
  const frames: CompressedFrame[] = [];
  const live = new Set<VideoFrame>();
  let completed = 0, submitted = 0, peakFrames = 0, nextLane = 0;
  let failure: Error | null = null;
  const decoder = new VideoDecoder({
    error: error => { failure = error; },
    output: frame => {
      live.add(frame); peakFrames = Math.max(peakFrames, live.size);
      const lane = lanes[nextLane++ % lanes.length];
      lane.encoding = lane.encoding.then(async () => {
        await waitVisible();
        if (failure) return;
        const ts = frame.timestamp;
        lane.context.drawImage(frame, 0, 0);
        frame.close(); live.delete(frame);
        const blob = await lane.surface.convertToBlob({ type: "image/webp", quality: homeConfig.webpQuality });
        frames.push({ ts, blob }); completed++;
      }).catch(error => { failure = error instanceof Error ? error : new Error("Frame encoding failed"); });
    },
  });
  try {
    decoder.configure(config);
    for (const sample of input.samples) {
      await waitVisible();
      while (submitted - completed >= homeConfig.decodeLead && !failure) await new Promise(resolve => setTimeout(resolve, 4));
      if (failure) throw failure;
      decoder.decode(new EncodedVideoChunk({ type: sample.is_sync ? "key" : "delta", timestamp: Math.round(sample.cts * 1e6 / sample.timescale), duration: Math.round(sample.duration * 1e6 / sample.timescale), data: sample.data }));
      submitted++;
    }
    await decoder.flush();
    await Promise.all(lanes.map(lane => lane.encoding));
    if (failure) throw failure;
    if (frames.length !== input.samples.length) throw new Error("Incomplete frame bank");
    frames.sort((a, b) => a.ts - b.ts);
    const start = frames[0].ts;
    frames.forEach(frame => { frame.ts -= start; });
    return { frames, peakFrames };
  } finally {
    if (decoder.state !== "closed") decoder.close();
    await Promise.all(lanes.map(lane => lane.encoding));
    live.forEach(frame => frame.close()); live.clear();
    lanes.forEach(lane => { lane.surface.width = 1; lane.surface.height = 1; });
  }
}

async function build(url: string) {
  const started = performance.now();
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Video download failed");
    const data = await response.arrayBuffer();
    const downloadMs = performance.now() - started;
    const input = await demux(data);
    const decodeStarted = performance.now();
    let result: Awaited<ReturnType<typeof decode>>, acceleration = "prefer-hardware";
    try { result = await decode(input, "prefer-hardware"); }
    catch (error) { scope.postMessage({ type: "retry", reason: error instanceof Error ? error.message : "Hardware decoder failed" }); acceleration = "prefer-software"; result = await decode(input, "prefer-software"); }
    scope.postMessage({ type: "ready", ...result, duration: input.track.duration / input.track.timescale, width: input.track.video.width, height: input.track.video.height, acceleration, buildMs: performance.now() - started, downloadMs, decodeMs: performance.now() - decodeStarted, compressedBytes: result.frames.reduce((total, frame) => total + frame.blob.size, 0) });
  } catch (error) { scope.postMessage({ type: "error", reason: error instanceof Error ? error.message : "Frame bank failed" }); }
}

scope.onmessage = event => {
  if (event.data.type === "pause") {
    paused = event.data.value;
    if (!paused) { resume.forEach(resolve => resolve()); resume = []; }
  } else void build(event.data.url);
};
