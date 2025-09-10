const CHAR_LF = 10; // '\n'
const CHAR_CR = 13; // '\r'
const CHAR_COLON = 58; // ':'
const CHAR_SPACE = 32; // ' '
const FIELD_EVENT = new Uint8Array([101, 118, 101, 110, 116]); // "event"
const FIELD_DATA = new Uint8Array([100, 97, 116, 97]); // "data"
const FIELD_ID = new Uint8Array([105, 100]); // "id"
// const FIELD_RETRY = new Uint8Array([114, 101, 116, 114, 121]); // "retry"
const sharedTextDecoder = new TextDecoder();

export interface SSEStreamTransformerOptions {
  parseData?: boolean;
  metadata?: boolean;
  maxLineLength?: number;
}

export interface SSEEvent<T = any> {
  data: T | string;
  type: string;
  lastEventId: string;
}

export class SSEStreamTransformer<T = any>
  extends TransformStream<Uint8Array, SSEEvent<T>> {
  constructor(options?: SSEStreamTransformerOptions) {
    super(new SSEProcessor<T>(options));
  }
}

class SSEProcessor<T> {
  private readonly parseData: boolean;
  private readonly metadata: boolean;
  private readonly maxLineLength: number;
  private partialBuffer: Uint8Array | null = null;
  private partialLength: number = 0;
  private currentEvent: Partial<SSEEvent<T>> = {};
  private dataLines: string[] = [];

  private static readonly DEFAULT_EVENT_TYPE = "message";

  constructor(options: SSEStreamTransformerOptions = {}) {
    this.parseData = options.parseData ?? false;
    this.metadata = options.metadata ?? false;
    this.maxLineLength = options.maxLineLength || 16384;
    this.partialBuffer = new Uint8Array(this.maxLineLength);
  }

  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<SSEEvent<T>>,
  ) {
    if (chunk.length === 0) return;

    let start = 0;

    // Append partial buffer if exists
    if (this.partialLength > 0) {
      const totalLen = this.partialLength + chunk.length;
      if (totalLen > this.maxLineLength) {
        this.partialLength = 0;
        controller.error(new Error("Line length exceeds maxLineLength"));
        return;
      }
      if (chunk.length > this.maxLineLength - this.partialLength) {
        this.partialLength = 0;
        controller.error(
          new Error("Chunk size exceeds remaining partial buffer space"),
        );
        return;
      }
      this.partialBuffer!.set(chunk, this.partialLength);
      chunk = this.partialBuffer!.subarray(0, totalLen);
      start = this.partialLength;
      this.partialLength = 0;
    }

    while (start < chunk.length) {
      const newlinePos = chunk.indexOf(CHAR_LF, start);

      if (newlinePos === -1) {
        const remainingLen = chunk.length - start;
        if (this.partialLength + remainingLen > this.maxLineLength) {
          this.partialLength = 0;
          controller.error(new Error("Line length exceeds maxLineLength"));
          return;
        }
        this.partialBuffer!.set(chunk.subarray(start), this.partialLength);
        this.partialLength += remainingLen;
        break;
      }

      let lineLength = newlinePos - start;
      if (lineLength > 0 && chunk[newlinePos - 1] === CHAR_CR) {
        lineLength--;
      }

      if (lineLength > 0) {
        this.processLine(chunk, start, lineLength);
      } else {
        this.dispatchEvent(controller);
      }

      start = newlinePos + 1;
    }
  }

  flush(controller: TransformStreamDefaultController<SSEEvent<T>>) {
    if (this.partialLength > 0) {
      let lineLength = this.partialLength;
      if (
        lineLength > 0 &&
        this.partialBuffer![lineLength - 1] === CHAR_CR
      ) {
        lineLength--;
      }
      if (lineLength > 0) {
        this.processLine(this.partialBuffer!, 0, lineLength);
      }
      this.dispatchEvent(controller);
    }
    this.partialLength = 0;
    this.partialBuffer = null;
    this.dataLines = [];
    this.currentEvent = {};
  }

  private processLine(
    line: Uint8Array,
    start: number,
    length: number,
  ) {
    if (line[start] === CHAR_COLON) return; // Ignore comments

    const colonPos = line.indexOf(CHAR_COLON, start);
    let fieldStart = start;
    let fieldLength = colonPos === -1 ? length : colonPos - start;
    let valueStart = colonPos === -1 ? start + length : colonPos + 1;
    let valueLength = colonPos === -1 ? 0 : length - (colonPos - start + 1);

    if (valueLength > 0 && line[valueStart] === CHAR_SPACE) {
      valueStart++;
      valueLength--;
    }

    if (this.matchField(line, fieldStart, fieldLength, FIELD_EVENT)) {
      this.currentEvent.type = valueLength > 0
        ? sharedTextDecoder.decode(
          line.subarray(valueStart, valueStart + valueLength),
        )
        : SSEProcessor.DEFAULT_EVENT_TYPE;
    } else if (this.matchField(line, fieldStart, fieldLength, FIELD_DATA)) {
      if (valueLength > 0) {
        const data = sharedTextDecoder.decode(
          line.subarray(valueStart, valueStart + valueLength),
        );
        this.dataLines.push(data);
      }
    } else if (this.matchField(line, fieldStart, fieldLength, FIELD_ID)) {
      if (valueLength > 0 && line.indexOf(0, valueStart) === -1) {
        this.currentEvent.lastEventId = sharedTextDecoder.decode(
          line.subarray(valueStart, valueStart + valueLength),
        );
      }
    }
  }

  private dispatchEvent(
    controller: TransformStreamDefaultController<SSEEvent<T>>,
  ) {
    if (this.dataLines.length === 0) {
      this.dataLines = [];
      this.currentEvent = {};
      return;
    }

    const finalData = this.dataLines.join("\n");
    let dataValue: string | T = finalData;

    if (this.parseData) {
      try {
        dataValue = JSON.parse(finalData);
      } catch {
        // Fallback to string, per SSE spec
        console.warn("Failed to parse JSON: " + finalData);
      }
    }

    const event: SSEEvent<T> = this.metadata
      ? {
        data: dataValue,
        type: this.currentEvent.type ?? SSEProcessor.DEFAULT_EVENT_TYPE,
        lastEventId: this.currentEvent.lastEventId ?? "",
      }
      : dataValue as any;

    controller.enqueue(event);
    this.dataLines = [];
    this.currentEvent = {};
  }

  private matchField(
    view: Uint8Array,
    start: number,
    len: number,
    pattern: Uint8Array,
  ): boolean {
    if (len !== pattern.length) return false;

    if (pattern.length === 4 && pattern[0] === FIELD_DATA[0]) {
      return view[start] === 100 && view[start + 1] === 97 &&
        view[start + 2] === 116 && view[start + 3] === 97;
    }
    if (pattern.length === 5 && pattern[0] === FIELD_EVENT[0]) {
      return view[start] === 101 && view[start + 1] === 118 &&
        view[start + 2] === 101 && view[start + 3] === 110 &&
        view[start + 4] === 116;
    }
    if (pattern.length === 2 && pattern[0] === FIELD_ID[0]) {
      return view[start] === 105 && view[start + 1] === 100;
    }

    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== view[start + i]) return false;
    }
    return true;
  }
}
