export class RingBuffer {
  private buffer: Uint8Array;
  private writePos = 0;
  private readPos = 0;
  private _occupied = 0;
  private mask: number;
  private readonly maxSize: number;

  constructor(initialSize: number, maxSize: number) {
    if (initialSize <= 0) throw new RangeError("initialSize must be positive.");
    if (maxSize < initialSize) {
      throw new RangeError("maxSize must be >= initialSize.");
    }
    const sz = 1 << (31 - Math.clz32(initialSize - 1 | 0));
    this.buffer = new Uint8Array(sz);
    this.mask = sz - 1;
    this.maxSize = maxSize;
  }

  get occupied(): number {
    return this._occupied;
  }

  peekByte(offset: number): number {
    return this.buffer[(this.readPos + offset) & this.mask];
  }

  write(chunk: Uint8Array): boolean {
    const len = chunk.length;
    if (len > this.buffer.length - this._occupied && !this.resize(len)) {
      return false;
    }
    const w = this.writePos;
    const first = Math.min(len, this.buffer.length - w);
    this.buffer.set(chunk.subarray(0, first), w);
    const second = len - first;
    if (second > 0) this.buffer.set(chunk.subarray(first), 0);
    this.writePos = (w + len) & this.mask;
    this._occupied += len;
    return true;
  }

  getView(startOffset: number, len: number): Uint8Array {
    const phys = (this.readPos + startOffset) & this.mask;

    return this.buffer.subarray(phys, phys + len);
  }

  consume(len: number): void {
    if (len <= 0) return;
    this._occupied -= len;
    this.readPos = (this.readPos + len) & this.mask;
  }

  matchSequence(pos: number, sequence: number[]): boolean {
    for (let i = 0; i < sequence.length; i++) {
      if (this.peekByte(pos + i) !== sequence[i]) return false;
    }
    return true;
  }

  private resize(required: number): boolean {
    const newSize = 1 << (31 - Math.clz32(this._occupied + required - 1 | 0));
    if (newSize > this.maxSize) return false;
    const newBuffer = new Uint8Array(newSize);
    if (this._occupied > 0) {
      const r = this.readPos;
      const w = this.writePos;
      if (r < w) {
        newBuffer.set(this.buffer.subarray(r, w), 0);
      } else {
        const tail = this.buffer.length - r;
        newBuffer.set(this.buffer.subarray(r), 0);
        newBuffer.set(this.buffer.subarray(0, w), tail);
      }
    }
    this.buffer = newBuffer;
    this.readPos = 0;
    this.writePos = this._occupied;
    this.mask = newSize - 1;
    return true;
  }
}