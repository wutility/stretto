export function handleDecompression(response: Response): Response {
  const encoding = response.headers.get('content-encoding');
  if (!encoding || !response.body || typeof DecompressionStream === 'undefined') return response;

  // @ts-ignore
  const decompressedBody = response.body.pipeThrough(new DecompressionStream(encoding));
  return new Response(decompressedBody, response);
}