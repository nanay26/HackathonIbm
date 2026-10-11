/**
 * CharCounter — shows current / max character count.
 * Turns red when over the limit, yellow when under the minimum.
 * SDD §F1 AC-3,4,5
 */
import { MIN_CHARS, MAX_CHARS } from "@/lib/schemas";
import { cn } from "@/lib/utils";

interface Props {
  count: number;
}

export function CharCounter({ count }: Props) {
  const tooShort = count > 0 && count < MIN_CHARS;
  const tooLong = count > MAX_CHARS;
  const ok = count >= MIN_CHARS && count <= MAX_CHARS;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "text-sm font-mono",
        tooLong && "text-red-600 font-semibold",
        tooShort && "text-yellow-600",
        ok && "text-gray-500"
      )}
    >
      {count.toLocaleString("id-ID")} / {MAX_CHARS.toLocaleString("id-ID")} karakter
      {tooShort && count > 0 && (
        <span className="ml-2 text-yellow-700">
          (minimum {MIN_CHARS.toLocaleString("id-ID")} karakter)
        </span>
      )}
      {tooLong && (
        <span className="ml-2 text-red-700">
          (melebihi batas — kurangi {(count - MAX_CHARS).toLocaleString("id-ID")} karakter)
        </span>
      )}
    </div>
  );
}
