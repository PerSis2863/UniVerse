// HTTP errors with the same names, status codes and JSON shape ({ statusCode, message, error })
// as NestJS, so code ported from the old NestJS API behaves the same for the web client.

const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export class HttpException extends Error {
  constructor(
    readonly response: string | Record<string, unknown>,
    readonly status: number,
  ) {
    super(typeof response === 'string' ? response : String(response.message ?? REASONS[status] ?? 'Error'));
  }

  getStatus() {
    return this.status;
  }

  toJSON() {
    if (typeof this.response === 'object') return { statusCode: this.status, ...this.response };
    const reason = REASONS[this.status] ?? 'Error';
    return this.response === reason
      ? { statusCode: this.status, message: reason }
      : { statusCode: this.status, message: this.response, error: reason };
  }
}

const make = (status: number) =>
  class extends HttpException {
    constructor(message?: string | Record<string, unknown>) {
      super(message ?? REASONS[status], status);
    }
  };

export const BadRequestException = make(400);
export const UnauthorizedException = make(401);
export const ForbiddenException = make(403);
export const NotFoundException = make(404);
export const ConflictException = make(409);
export const PayloadTooLargeException = make(413);
export const UnprocessableEntityException = make(422);
export const InternalServerErrorException = make(500);
export const ServiceUnavailableException = make(503);

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;
