type ClassValue = string | number | false | null | undefined;

/** Minimal class-name joiner (avoids an extra runtime dependency). */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
