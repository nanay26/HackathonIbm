/**
 * TextPreview — editable textarea showing extracted/pasted text.
 * Emits onChange so parent can track the live text.
 * SDD §F1 AC-4,5 — shows char count, enables editing before submit.
 */
"use client";

import { CharCounter } from "./CharCounter";

interface Props {
  value: string;
  onChange: (text: string) => void;
  filename?: string;
  warnings?: string[];
}

export function TextPreview({ value, onChange, filename, warnings = [] }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {filename && (
        <p className="text-sm text-gray-500">
          File: <span className="font-medium text-gray-700">{filename}</span>
        </p>
      )}

      {warnings.length > 0 && (
        <div
          role="alert"
          className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800"
        >
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <label htmlFor="text-preview" className="sr-only">
        Teks dokumen yang diekstrak
      </label>
      <textarea
        id="text-preview"
        className="min-h-[200px] w-full rounded border border-gray-300 p-3 font-mono text-sm
                   leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500
                   resize-y"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Teks dokumen"
        aria-describedby="char-counter"
      />

      <div id="char-counter">
        <CharCounter count={value.length} />
      </div>
    </div>
  );
}
