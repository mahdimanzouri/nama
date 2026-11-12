import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { HttpError } from "./errors.ts";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_VERSION = 1;

export interface CredentialCipher {
  readonly keyVersion: number;
  encrypt(plaintext: Buffer): Buffer;
  decrypt(ciphertext: Buffer): Buffer;
}

export function createCredentialCipher(key: string | undefined): CredentialCipher | null {
  if (!key) return null;
  const keyBytes = Buffer.from(key, "base64");
  if (keyBytes.length !== KEY_BYTES) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 32 base64-encoded bytes");
  }

  return {
    keyVersion: KEY_VERSION,
    encrypt(plaintext: Buffer): Buffer {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, keyBytes, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([Buffer.from([KEY_VERSION]), iv, tag, encrypted]);
    },
    decrypt(ciphertext: Buffer): Buffer {
      const version = ciphertext[0];
      if (version !== KEY_VERSION) {
        throw new Error(`Unsupported credential key version ${String(version)}`);
      }
      const iv = ciphertext.subarray(1, 1 + IV_BYTES);
      const tag = ciphertext.subarray(1 + IV_BYTES, 1 + IV_BYTES + 16);
      const encrypted = ciphertext.subarray(1 + IV_BYTES + 16);
      const decipher = createDecipheriv(ALGORITHM, keyBytes, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    },
  };
}

export function requireCredentialCipher(
  cipher: CredentialCipher | null,
): CredentialCipher {
  if (!cipher) {
    throw new HttpError(503, {
      code: "CREDENTIALS_NOT_CONFIGURED",
      message: "Credential storage is not configured on this server",
    });
  }
  return cipher;
}
