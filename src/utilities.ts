import { SPACE } from "./constants.ts";

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Checks if a Uint8Array starts with a given prefix. */
export const startsWith = (arr: Uint8Array, prefix: Uint8Array): boolean => {
  if (prefix.length > arr.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (arr[i] !== prefix[i]) return false;
  }
  return true;
};

/** Trims a single leading space from a Uint8Array, returning a view. */
export const trimLeadingSpace = (arr: Uint8Array): Uint8Array => {
  return arr.length > 0 && arr[0] === SPACE ? arr.subarray(1) : arr;
};