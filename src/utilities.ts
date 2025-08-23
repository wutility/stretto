// utilities.ts
import { DEFAULT_MAX_RETRY_DELAY, DEFAULT_RETRIES, DEFAULT_RETRY_DELAY } from "./constants";
import { Parser, RetryOpts, RetryStrategy } from "./types";

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export const anySignal = (...signals: (AbortSignal | undefined)[]) => {
    const ctrl = new AbortController();
    for (const s of signals) {
        if (!s) continue;
        if (s.aborted) { ctrl.abort(); break; }
        s.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
    return ctrl.signal;
};

export const chainParsers = <T>(parsers: Parser<any>[]): Parser<T> => {
    return (input: ArrayBuffer): T | null => {
        let currentInput: any = input;
        for (const parser of parsers) {
            const result = parser(currentInput);
            if (result === null) {
                return null;
            }
            currentInput = result;
        }
        return currentInput as T;
    };
};

/**
 * Default retry strategy using exponential backoff with jitter.
 */
const defaultRetryStrategy = (
    maxRetries: number,
    baseDelay: number,
    maxDelay: number
): RetryStrategy => {
    return (attempt: number, error: Error): number | null => {
        if (attempt > maxRetries) {
            return null;
        }
        const jitter = 0.5 + Math.random(); // Jitter between 0.5 and 1.5
        const delay = Math.min(
            baseDelay * 2 ** (attempt - 1) * jitter,
            maxDelay
        );
        return delay;
    };
};

export async function* withRetries<T>(opts: RetryOpts, factory: (signal: AbortSignal) => AsyncGenerator<T>): AsyncGenerator<T, void, undefined> {
    const {
        retries = DEFAULT_RETRIES,
        retryDelay = DEFAULT_RETRY_DELAY,
        maxRetryDelay = DEFAULT_MAX_RETRY_DELAY,
        signal: outerSignal,
        retryStrategy,
    } = opts;

    const strategy = retryStrategy ?? defaultRetryStrategy(retries, retryDelay, maxRetryDelay);
    let attempt = 0;

    while (true) {
        const ctrl = new AbortController();
        const signal = anySignal(ctrl.signal, outerSignal);

        try {
            const stream = factory(signal);
            for await (const chunk of stream) {
                yield chunk;
            }
            return; // Success
        } catch (err) {
            if (signal.aborted) {
                throw err;
            }
            
            attempt++;
            const delay = strategy(attempt, err as Error);

            if (delay === null) {
                throw err; // Strategy decided to stop retrying
            }

            await sleep(delay);
        }
    }
}