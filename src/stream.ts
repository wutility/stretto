import {  StrettoStreamableResponse } from "./types";

// --- Constants ---
const ERROR_MSG_BODY_CONSUMED = "Body has already been consumed.";
const ASYNC_ITERATOR = Symbol.asyncIterator;

export default /**
* Wraps a Response with a Proxy to make it an AsyncIterable.
* This is a zero-copy, high-performance path for handling response streams.
*/
function addStreamingCapability<T>(
 response: Response,
 transformers: TransformStream<any, any>[],
 userSignal?: AbortSignal,
): StrettoStreamableResponse<T> {
 if (!response.body) {
   return response as StrettoStreamableResponse<T>;
 }

 let iteratorUsed = false;
 const functionCache = new Map<PropertyKey, Function>();

 // PERF: Pre-compute the final stream source *once* when the proxy is created.
 const finalStreamSource = transformers.length > 0
   ? transformers.reduce(
     (readable, transformer) => readable.pipeThrough(transformer),
     response.body,
   )
   : response.body;

 const proxyHandler: ProxyHandler<Response> = {
   get(target, prop) {
     if (prop === ASYNC_ITERATOR) {
       return async function* () {
         if (iteratorUsed) throw new Error(ERROR_MSG_BODY_CONSUMED);
         iteratorUsed = true;
         const reader = finalStreamSource.getReader();
         const onAbort = () =>
           reader.cancel(userSignal?.reason).catch(() => {});
         userSignal?.addEventListener("abort", onAbort);
         try {
           while (true) {
             const { done, value } = await reader.read();
             if (done) return;
             yield value;
           }
         } finally {
           userSignal?.removeEventListener("abort", onAbort);
           reader.releaseLock();
         }
       };
     }
     const value = Reflect.get(target, prop);
     if (typeof value === "function") {
       if (!functionCache.has(prop)) {
         functionCache.set(prop, value.bind(target));
       }
       return functionCache.get(prop);
     }
     return value;
   },
 };
 return new Proxy(response, proxyHandler) as StrettoStreamableResponse<T>;
}