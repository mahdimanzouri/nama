import { hash, verify } from "@node-rs/argon2";

/**
 * ADR-007 requires Argon2id. The library defaults are the OWASP baseline
 * (m=19456, t=2, p=1); parameters are recorded in the encoded hash.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
