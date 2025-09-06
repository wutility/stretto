/**
 * An error representing a non-successful HTTP response. It includes the response object for further inspection.
 */
export class HTTPError extends Error {
  public readonly response: Response;

  constructor(message: string, response: Response) {
    super(message);
    this.name = "HTTPError";
    this.response = response;
  }
}