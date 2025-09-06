// src/lib/RingBuffer.ts
/**
 * Zero-copy ring buffer optimized for SSE parsing.
 * Provides direct buffer access to eliminate unnecessary allocations.
 */
export class RingBuffer {
  private buffer: Uint8Array;
  private writePos: number = 0;
  private readPos: number = 0;
  private _occupied: number = 0;

  constructor(size: number) {
    // Ensure power of 2 for faster modulo operations
    const actualSize = Math.pow(2, Math.ceil(Math.log2(size)));
    this.buffer = new Uint8Array(actualSize);
  }

  public get size(): number {
    return this.buffer.length;
  }

  public get occupied(): number {
    return this._occupied;
  }

  public get available(): number {
    return this.size - this._occupied;
  }

  /**
   * Direct buffer access - zero-copy byte reading
   */
  public getByteAt(index: number): number {
    return this.buffer[index & (this.size - 1)]; // Fast modulo for power of 2
  }

  /**
   * Get the underlying buffer for direct access (DANGEROUS - use with caution)
   */
  public getBuffer(): Uint8Array {
    return this.buffer;
  }

  /**
   * Get current read position in the physical buffer
   */
  public get currentReadPos(): number {
    return this.readPos;
  }

  /**
   * Writes data to buffer with minimal copying
   */
  public write(chunk: Uint8Array): boolean {
    if (chunk.length > this.available) {
      return false;
    }

    const firstPartLength = Math.min(chunk.length, this.size - this.writePos);
    if (firstPartLength > 0) {
      // Use native, fast copy
      this.buffer.set(chunk.subarray(0, firstPartLength), this.writePos);
    }

    const secondPartLength = chunk.length - firstPartLength;
    if (secondPartLength > 0) {
      // Use native, fast copy for the wrapped part
      this.buffer.set(chunk.subarray(firstPartLength), 0);
    }

    this.writePos = (this.writePos + chunk.length) & (this.size - 1);
    this._occupied += chunk.length;
    return true;
  }

  /**
   * Creates a view without copying - zero-copy when possible
   * Only copies when data wraps around the buffer
   */
  public getView(startOffset: number, length: number): Uint8Array {
    if (length === 0) {
      return new Uint8Array(0);
    }

    const mask = this.size - 1;
    const physicalStart = (this.readPos + startOffset) & mask;
    const physicalEnd = (physicalStart + length) & mask;

    // Check if data wraps around
    if (physicalStart + length <= this.size) {
      // No wrap - return zero-copy view
      return this.buffer.subarray(physicalStart, physicalStart + length);
    }

    // Data wraps - must copy (minimize this case)
    const result = new Uint8Array(length);
    const firstPartLength = this.size - physicalStart;

    result.set(
      this.buffer.subarray(physicalStart, physicalStart + firstPartLength),
      0,
    );
    result.set(
      this.buffer.subarray(0, length - firstPartLength),
      firstPartLength,
    );

    return result;
  }

  /**
   * Advances read position and frees space
   */
  public consume(length: number): void {
    if (length > this._occupied) {
      throw new Error("Cannot consume more than occupied space");
    }

    this.readPos = (this.readPos + length) & (this.size - 1);
    this._occupied -= length;
  }

  /**
   * Peek at data without consuming - zero-copy when possible
   */
  public peekByte(offset: number): number {
    if (offset >= this._occupied) {
      throw new Error("Offset beyond occupied data");
    }
    return this.getByteAt(this.readPos + offset);
  }

  /**
   * Find pattern in buffer without creating intermediate arrays
   * Returns offset from current read position, or -1 if not found
   */
  public findPattern(pattern: number[], maxSearch?: number): number {
    const searchLimit = Math.min(
      maxSearch ?? this._occupied,
      this._occupied - pattern.length + 1,
    );

    for (let offset = 0; offset <= searchLimit - pattern.length; offset++) {
      let match = true;
      for (let i = 0; i < pattern.length; i++) {
        if (this.peekByte(offset + i) !== pattern[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        return offset;
      }
    }
    return -1;
  }
}
