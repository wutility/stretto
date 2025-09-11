/**
 * Efficiently compares a section of a Uint8Array with an expected byte sequence.
 * This is used for the user-defined `donePrefix`.
 * @param buffer The buffer to search within.
 * @param start The starting offset in the buffer.
 * @param expectedBytes The byte sequence to match.
 * @returns True if the bytes match, false otherwise.
 */
export function isMatchingBytes(buffer: Uint8Array, start: number, expectedBytes: Uint8Array | readonly number[],): boolean {
  if (start + expectedBytes.length > buffer.length) {
    return false;
  }
  for (let i = 0; i < expectedBytes.length; i++) {
    if (buffer[start + i] !== expectedBytes[i]) {
      return false;
    }
  }
  return true;
}