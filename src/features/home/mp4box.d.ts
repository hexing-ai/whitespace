declare module "mp4box" {
  export class DataStream {
    static BIG_ENDIAN: boolean;
    constructor(buffer?: ArrayBuffer, byteOffset?: number, endianness?: boolean);
    buffer: ArrayBuffer;
  }
  export interface Sample { cts: number; duration: number; timescale: number; is_sync: boolean; data: Uint8Array<ArrayBuffer> }
  export interface Track { id: number; codec: string; duration: number; timescale: number; nb_samples: number; video: { width: number; height: number } }
  interface CodecBox { write(stream: DataStream): void }
  interface Entry { avcC?: CodecBox; hvcC?: CodecBox; vpcC?: CodecBox; av1C?: CodecBox }
  export interface ISOFile {
    onReady: (info: { videoTracks: Track[] }) => void;
    onSamples: (id: number, user: unknown, samples: Sample[]) => void;
    onError: (message: string) => void;
    getTrackById(id: number): { mdia: { minf: { stbl: { stsd: { entries: Entry[] } } } } };
    setExtractionOptions(id: number, user: unknown, options: { nbSamples: number }): void;
    appendBuffer(buffer: ArrayBuffer & { fileStart: number }): void;
    start(): void;
    stop(): void;
    flush(): void;
  }
  export function createFile(): ISOFile;
}
