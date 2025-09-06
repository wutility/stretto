// src/index.ts

export { default } from "./core";

export { HTTPError } from "./errors";

export type {
  StrettoOptions,
  StrettoStreamableResponse,
  RetryStrategy,
  BackoffStrategy,
} from "./types";