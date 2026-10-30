/**
 * Sanitization utilities for untrusted on-chain metadata, user-provided URLs, and media.
 * Defends against XSS, script injection, and URI scheme hijacking.
 */

/**
 * Sanitizes external URLs (e.g. from token metadata, NFT metadata, or block explorer).
 *
 * Rules:
 * - Only allow https:// and ipfs:// gateway URLs (converts ipfs:// to https://ipfs.io/ipfs/...)
 * - Strictly blocks javascript:, vbscript:, data:text/html, and any executable URI schemes.
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  // Block obvious dangerous schemes immediately
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:text/html") ||
    lower.startsWith("data:text/javascript") ||
    lower.startsWith("data:application/javascript")
  ) {
    return null;
  }

  // Rewrite ipfs:// protocol to a secure public HTTPS gateway
  if (lower.startsWith("ipfs://")) {
    const cidPath = trimmed.slice(7).replace(/^ipfs\//, "");
    return `https://ipfs.io/ipfs/${cidPath}`;
  }

  // Allow safe https:// or http:// URLs
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {
    // Malformed URL string
    return null;
  }

  return null;
}

/**
 * Sanitizes image URLs specifically. Allows https:, http:, ipfs gateway,
 * and safe inline base64 raster images (png, jpeg, webp, gif).
 * Strictly forbids SVG data URLs to prevent embedded script execution.
 */
export function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  // Allow safe raster base64 data URLs
  if (
    lower.startsWith("data:image/png;base64,") ||
    lower.startsWith("data:image/jpeg;base64,") ||
    lower.startsWith("data:image/webp;base64,") ||
    lower.startsWith("data:image/gif;base64,")
  ) {
    return trimmed;
  }

  // For everything else, defer to standard HTTPS / IPFS sanitization
  return sanitizeUrl(trimmed);
}
