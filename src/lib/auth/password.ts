import argon2 from "argon2";

// A fixed dummy hash to run argon2.verify against when no user exists, so
// login takes the same time and returns the same error whether the account
// exists or not — otherwise response timing/shape would leak which case it is.
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$cwj4VX9b1y4FYzqozmTsUQ$Dmbuw5GaSX2dFtKhXrwuNAV44DF9PyuC3ufrOos5vzE";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string | null,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash ?? DUMMY_HASH, password);
  } catch {
    return false;
  }
}
