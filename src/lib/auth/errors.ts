export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class UnauthenticatedError extends HttpError {
  constructor(message = "Authentication required") {
    super(401, message);
    this.name = "UnauthenticatedError";
  }
}

// Deliberately the same class/status for "not a member" and "org doesn't
// exist" — see requireOrgAccess.ts for why.
export class OrgAccessError extends HttpError {
  constructor(message = "Not found") {
    super(404, message);
    this.name = "OrgAccessError";
  }
}

export class EmailInUseError extends HttpError {
  constructor(message = "An account with that email already exists") {
    super(409, message);
    this.name = "EmailInUseError";
  }
}

export class InvalidCredentialsError extends HttpError {
  constructor(message = "Invalid email or password") {
    super(401, message);
    this.name = "InvalidCredentialsError";
  }
}

export class InvalidResetTokenError extends HttpError {
  constructor(message = "This reset link is invalid or has expired") {
    super(400, message);
    this.name = "InvalidResetTokenError";
  }
}

export class RateLimitedError extends HttpError {
  constructor(
    message = "Too many requests",
    public readonly retryAfterMs: number,
  ) {
    super(429, message);
    this.name = "RateLimitedError";
  }
}
