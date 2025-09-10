// Constants
const NEWLINE = 0x0a; // '\n'
const CARRIAGE_RETURN = 0x0d; // '\r'
const DATA_PREFIX = new Uint8Array([100, 97, 116, 97, 58, 32]); // "data: "
const DONE_MARKER = new Uint8Array([91, 68, 79, 78, 69, 93]); // "[DONE]"
const sharedTextDecoder = new TextDecoder();
const sharedTextEncoder = new TextEncoder();

export interface JSONStreamTransformerOptions {
  donePrefix?: string;
  dataPrefix?: string;
  parseData?: boolean;
  maxBufferSize?: number;
}

export class JSONStreamTransformer extends TransformStream<Uint8Array, any> {
  constructor(options?: JSONStreamTransformerOptions) {
    super(new JSONTransformer(options));
  }
}

class JSONTransformer {
  private readonly dataPrefix: Uint8Array;
  private readonly donePrefix: Uint8Array;
  private readonly parseData: boolean;
  private readonly maxBufferSize: number;
  private buffer: Uint8Array;
  private writePos = 0;
  private readPos = 0;
  private occupied = 0;

  constructor(options: JSONStreamTransformerOptions = {}) {
    this.parseData = options.parseData ?? true;
    this.maxBufferSize = options.maxBufferSize || 8192;
    this.buffer = new Uint8Array(this.maxBufferSize);

    this.dataPrefix = options.dataPrefix
      ? sharedTextEncoder.encode(options.dataPrefix)
      : DATA_PREFIX;
    this.donePrefix = options.donePrefix
      ? sharedTextEncoder.encode(options.donePrefix)
      : DONE_MARKER;
  }

  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<any>,
  ) {
    if (chunk.length === 0) return;

    // Fast path for exact data prefix match
    if (
      chunk.length === this.dataPrefix.length &&
      this.bytesEqual(chunk, this.dataPrefix)
    ) {
      if (this.ensureCapacity(chunk.length)) {
        this.writeChunk(chunk);
      }
      return;
    }

    // Ensure we have enough space
    if (this.occupied + chunk.length > this.maxBufferSize) {
      this.reset();
      console.warn("Buffer overflow: Discarding data to prevent overflow");
      return;
    }

    this.writeChunk(chunk);
    this.processBuffer(controller);
  }

  flush(controller: TransformStreamDefaultController<any>) {
    if (this.occupied > 0) {
      this.processLine(controller, this.readPos, this.occupied);
    }
    this.reset();
  }

  private writeChunk(chunk: Uint8Array) {
    const wrapPoint = this.maxBufferSize - this.writePos;

    if (chunk.length <= wrapPoint) {
      this.buffer.set(chunk, this.writePos);
    } else {
      this.buffer.set(chunk.subarray(0, wrapPoint), this.writePos);
      this.buffer.set(chunk.subarray(wrapPoint), 0);
    }

    this.writePos = (this.writePos + chunk.length) % this.maxBufferSize;
    this.occupied += chunk.length;
  }

  private processBuffer(controller: TransformStreamDefaultController<any>) {
    while (this.occupied > 0) {
      const newlinePos = this.findByte(NEWLINE);

      if (newlinePos === -1) {
        this.compactBuffer();
        break;
      }

      let lineLength = newlinePos - this.readPos;
      // Check for CR before NL
      if (
        lineLength > 0 &&
        this.buffer[(this.readPos + lineLength - 1) % this.maxBufferSize] ===
        CARRIAGE_RETURN
      ) {
        lineLength--;
      }

      if (lineLength > 0) {
        this.processLine(controller, this.readPos, lineLength);
      }

      // Move past this line including newline
      const consumeLength = newlinePos - this.readPos + 1;
      this.readPos = (this.readPos + consumeLength) % this.maxBufferSize;
      this.occupied -= consumeLength;
    }
  }

  private processLine(
    controller: TransformStreamDefaultController<any>,
    start: number,
    length: number,
  ) {
    if (length < this.dataPrefix.length) return;

    // Check if line starts with data prefix
    if (!this.matchPrefix(this.dataPrefix, start)) {
      return;
    }

    const jsonStart = (start + this.dataPrefix.length) % this.maxBufferSize;
    const jsonLength = length - this.dataPrefix.length;
    if (jsonLength === 0) return;

    // Check for done marker
    if (
      jsonLength === this.donePrefix.length &&
      this.matchPrefix(this.donePrefix, jsonStart)
    ) {
      controller.terminate();
      this.reset();
      return;
    }

    const jsonString = this.decodeRange(jsonStart, jsonLength);
    try {
      controller.enqueue(this.parseData ? JSON.parse(jsonString) : jsonString);
    } catch (e) {
      console.warn("Failed to parse JSON: " + jsonString);
    }
  }

  private findByte(target: number): number {
    let pos = this.readPos;
    const end = this.readPos + this.occupied;

    while (pos < end) {
      if (this.buffer[pos % this.maxBufferSize] === target) return pos;
      pos++;
    }
    return -1;
  }

  private bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private matchPrefix(pattern: Uint8Array, start: number): boolean {
    // Fast path for data prefix (most common case)
    if (pattern.length === 6 && pattern === DATA_PREFIX) {
      const s0 = start % this.maxBufferSize;
      const s1 = (start + 1) % this.maxBufferSize;
      const s2 = (start + 2) % this.maxBufferSize;
      const s3 = (start + 3) % this.maxBufferSize;
      const s4 = (start + 4) % this.maxBufferSize;
      const s5 = (start + 5) % this.maxBufferSize;

      return this.buffer[s0] === 100 && this.buffer[s1] === 97 &&
        this.buffer[s2] === 116 && this.buffer[s3] === 97 &&
        this.buffer[s4] === 58 && this.buffer[s5] === 32;
    }

    // General case
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== this.buffer[(start + i) % this.maxBufferSize]) {
        return false;
      }
    }
    return true;
  }

  private decodeRange(start: number, length: number): string {
    const endPos = (start + length) % this.maxBufferSize;

    // If the range doesn't wrap around the buffer
    if (endPos > start || endPos === 0) {
      return sharedTextDecoder.decode(this.buffer.subarray(start, start + length));
    }

    // Handle wrap-around case
    const firstPart = this.buffer.subarray(start);
    const secondPart = this.buffer.subarray(0, endPos);

    // temporary concatenated buffer to avoid string concatenation
    const tempBuffer = new Uint8Array(firstPart.length + secondPart.length);
    tempBuffer.set(firstPart);
    tempBuffer.set(secondPart, firstPart.length);
    return sharedTextDecoder.decode(tempBuffer);
  }

  private compactBuffer() {
    if (this.readPos === 0) return;

    const moveLen = this.occupied;
    if (moveLen === 0) {
      this.readPos = 0;
      this.writePos = 0;
      return;
    }

    // Use built-in method for efficient memory copying
    this.buffer.copyWithin(0, this.readPos, this.readPos + moveLen);
    this.readPos = 0;
    this.writePos = moveLen;
  }

  private ensureCapacity(additionalBytes: number): boolean {
    if (this.occupied + additionalBytes <= this.maxBufferSize) {
      return true;
    }

    this.compactBuffer();
    return this.occupied + additionalBytes <= this.maxBufferSize;
  }

  private reset() {
    this.readPos = 0;
    this.writePos = 0;
    this.occupied = 0;
  }
}
