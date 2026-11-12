import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { DataSourceError } from "./types.ts";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function parseIpv4(address: string): number[] | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  const octets = parts.map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }
  return octets;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a = 0, b = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = parseIpv4(address);
    return octets === undefined || isPrivateIpv4(octets);
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized);
    if (mapped?.[1]) {
      const octets = parseIpv4(mapped[1]);
      return octets === undefined || isPrivateIpv4(octets);
    }
    return (
      normalized === "::" ||
      normalized === "::1" ||
      /^f[cd][0-9a-f]{2}:/u.test(normalized) ||
      /^fe[89ab][0-9a-f]:/u.test(normalized) ||
      /^ff[0-9a-f]{2}:/u.test(normalized) ||
      /^2001:db8:/u.test(normalized)
    );
  }
  return true;
}

/**
 * Rejects non-HTTP protocols and private, loopback, link-local, multicast and
 * metadata ranges. Callers must disable automatic redirects so a public host
 * cannot bounce the request into a private range.
 *
 * The address is resolved here and again by the HTTP client; pinning the
 * resolved address is tracked as hardening debt.
 */
export async function assertPublicUrl(raw: string, allowPrivate: boolean): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DataSourceError("QUERY_INVALID", "The data-source URL is not valid");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new DataSourceError(
      "QUERY_INVALID",
      "Only http and https data-source URLs are allowed",
    );
  }

  if (allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/gu, "");
  const addresses =
    isIP(host) === 0
      ? await lookup(host, { all: true }).then(
          (entries) => entries.map((entry) => entry.address),
          () => {
            throw new DataSourceError(
              "DATASOURCE_UNREACHABLE",
              "The data-source host could not be resolved",
            );
          },
        )
      : [host];

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new DataSourceError(
      "DATASOURCE_UNREACHABLE",
      "The data-source host resolves to a private or reserved address",
    );
  }

  return url;
}

export function isPrivateHost(address: string): boolean {
  return isPrivateAddress(address);
}
