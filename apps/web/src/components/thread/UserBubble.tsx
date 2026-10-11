/**
 * UserBubble — ringkas pesan pengguna di thread review.
 *
 * Menampilkan chip dokumen (nama file atau "Teks tertempel"),
 * jumlah karakter, jenis dokumen, dan waktu kirim.
 */
import { FileText, Type } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Nama file atau "Teks tertempel" */
  title: string;
  /** Jenis dokumen */
  docType?: string;
  /** Waktu submit */
  createdAt?: string;
  className?: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  proposal_skripsi: "Proposal Skripsi",
  skripsi_tesis: "Skripsi/Tesis",
  jurnal: "Jurnal",
  esai: "Esai",
};

function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function UserBubble({ title, docType, createdAt, className }: Props) {
  const isFile = !title.startsWith("Teks tertempel");
  const docLabel = docType ? (DOC_TYPE_LABELS[docType] ?? docType) : undefined;
  const time = formatTime(createdAt);

  return (
    <div
      className={cn("flex justify-end", className)}
      aria-label="Dokumen yang dikirimkan"
    >
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[70%]",
          "rounded-lg rounded-tr-sm",
          "border border-[rgb(var(--border))]",
          "bg-[rgb(var(--surface-2))]",
          "px-4 py-3",
          "flex flex-col gap-2",
        )}
      >
        {/* Chip dokumen */}
        <div className="flex items-center gap-2.5">
          <span
            className="flex items-center justify-center rounded-lg p-1.5
                       bg-[rgb(var(--accent-mid))]/10"
            aria-hidden="true"
          >
            {isFile ? (
              <FileText size={14} className="text-[rgb(var(--accent-mid))]" />
            ) : (
              <Type size={14} className="text-[rgb(var(--accent-mid))]" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[rgb(var(--fg))]">
              {title}
            </p>
            {docLabel && <p className="text-xs text-[rgb(var(--fg-muted))">{docLabel}</p>}
          </div>
        </div>

        {/* Waktu */}
        {time && (
          <p className="text-right text-[10px] text-[rgb(var(--fg-muted))]" aria-label={`Dikirim pukul ${time}`}>
            {time}
          </p>
        )}
      </div>
    </div>
  );
}
