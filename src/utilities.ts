export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && 
  (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(value) === Object.prototype);