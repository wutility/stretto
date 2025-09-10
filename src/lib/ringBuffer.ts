// file: ringBuffer.ts

export class RingBuffer {
  private readonly buffer: Uint8Array;
  private writePos = 0;
  private readPos = 0;
  private _occupied = 0;
  private readonly mask: number;

  constructor(size: number = 8192) {
    if (size <= 0) throw new RangeError("Buffer size must be positive.");
    // Force size to the next power of two for efficient bitwise masking
    const sz = 1 << (31 - Math.clz32(size - 1 | 0));
    this.buffer = new Uint8Array(sz);
    this.mask = sz - 1;
  }

  get occupied(): number {
    return this._occupied;
  }
  get capacity(): number {
    return this.buffer.length;
  }

  peekByte(offset: number): number {
    return this.buffer[(this.readPos + offset) & this.mask];
  }

  /**
   * Writes a chunk to the buffer.
   * @returns `false` if the buffer does not have enough capacity.
   */
  write(chunk: Uint8Array): boolean {
    const len = chunk.length;
    if (this._occupied + len > this.buffer.length) {
      // Not enough space, write fails.
      return false;
    }

    const w = this.writePos;
    const part1Len = Math.min(len, this.buffer.length - w);
    this.buffer.set(chunk.subarray(0, part1Len), w);

    const part2Len = len - part1Len;
    if (part2Len > 0) {
      this.buffer.set(chunk.subarray(part1Len), 0);
    }

    this.writePos = (w + len) & this.mask;
    this._occupied += len;
    return true;
  }

  getView(startOffset: number, len: number): Uint8Array {
    const physStart = (this.readPos + startOffset) & this.mask;

    // Simple case: the view does not wrap around the buffer's physical end
    if (physStart + len <= this.buffer.length) {
      return this.buffer.subarray(physStart, physStart + len);
    }

    // Complex case: view wraps around, needs a temporary copy
    const combined = new Uint8Array(len);
    const part1Len = this.buffer.length - physStart;
    combined.set(this.buffer.subarray(physStart));
    combined.set(this.buffer.subarray(0, len - part1Len), part1Len);
    return combined;
  }

  consume(len: number): void {
    if (len <= 0) return;
    len = Math.min(len, this._occupied); // Do not consume more than occupied
    this._occupied -= len;
    this.readPos = (this.readPos + len) & this.mask;
  }
}
