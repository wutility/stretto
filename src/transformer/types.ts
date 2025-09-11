export interface JSONStreamOptions {
  /** Maximum size in bytes for a single SSE line. Defaults to 8192. */
  maxBuffer?: number;
  /** A custom string that, when received as a data payload, terminates the stream. */
  donePrefix?: string;
  /** Whether to parse the JSON data payload. If false, outputs strings. Defaults to true. */
  parseData?: boolean;
  /**
   * How to handle lines that exceed maxBuffer.
   * - 'skip': Reset buffer and skip the line (default, resilient).
   * - 'throw': Immediately throw a RangeError to signal a protocol violation.
   */
  onBufferOverflow?: "skip" | "throw";
  /**
   * How to handle payloads that are not valid JSON.
   * - 'skip': Log a warning and skip the payload (default).
   * - 'throw': Terminate the stream with a TypeError.
   */
  onParseError?: "skip" | "throw";
}