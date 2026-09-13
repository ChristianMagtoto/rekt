/**
 * Every error response from the API has this shape. Document any new `code`
 * value here and in API.md's Conventions section when it's introduced.
 */
export interface ApiError {
  error: {
    code: string; // e.g. UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR
    message: string;
  };
}

export class HttpError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }

  toResponse(): ApiError {
    return { error: { code: this.code, message: this.message } };
  }
}
