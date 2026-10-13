/**
 * Zod schemas matching the API contract (SDD §6).
 * Used for both runtime validation and TypeScript type inference.
 */
import { z } from "zod";

// ── Shared ─────────────────────────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

// ── F1 Extract ─────────────────────────────────────────────────────────────────

export const ExtractResponseSchema = z.object({
  text: z.string(),
  char_count: z.number().int(),
  filename: z.string(),
  warnings: z.array(z.string()),
});

export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

// ── F2 Reviews ─────────────────────────────────────────────────────────────────

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_approval",
  "done",
  "failed",
  "timeout",
  "cancelled",
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const TERMINAL_STATUSES: JobStatus[] = [
  "done",
  "failed",
  "timeout",
  "cancelled",
];

export const FindingSchema = z.object({
  no: z.number().int(),
  aspect: z.string(),
  description: z.string(),
  reference: z.string().nullable(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const ReviewerResultSchema = z.object({
  key: z.enum(["metodologi", "orisinalitas", "revisi"]),
  status: z.enum(["ok", "failed", "missing"]),
  verdict: z.string(),
  summary: z.string(),
  findings: z.array(FindingSchema),
  priority_recommendations: z.array(z.string()),
});

export type ReviewerResult = z.infer<typeof ReviewerResultSchema>;

export const DebatePointSchema = z.object({
  type: z.enum(["KONTRADIKSI", "PENGUATAN_SILANG", "ISU_UNIK"]),
  aspect: z.string(),
  description: z.string(),
  reviewers: z.array(z.string()),
  references: z.array(z.string()),
});

export type DebatePoint = z.infer<typeof DebatePointSchema>;

export const ParsedReportSchema = z.object({
  parse_ok: z.boolean(),
  reviewers: z.array(ReviewerResultSchema),
  debate_points: z.array(DebatePointSchema),
});

export type ParsedReport = z.infer<typeof ParsedReportSchema>;

export const ReviewStatusResponseSchema = z.object({
  status: JobStatusSchema,
  elapsed_seconds: z.number(),
  retry_available: z.boolean().optional(),
  active_reviewer: z.string().nullable().optional(),
  completed_reviewers: z.array(z.string()).optional(),
  approval: z
    .object({
      request_id: z.string(),
      prompt: z.string(),
      options: z.array(z.object({ action_id: z.string(), label: z.string() })),
    })
    .nullable()
    .optional(),
  result: ParsedReportSchema.nullable().optional(),
  raw_output: z.string().nullable().optional(),
  error: z
    .object({ code: z.string(), message: z.string() })
    .nullable()
    .optional(),
});

export type ReviewStatusResponse = z.infer<typeof ReviewStatusResponseSchema>;

export const CreateReviewResponseSchema = z.object({
  review_id: z.string(),
});

export type CreateReviewResponse = z.infer<typeof CreateReviewResponseSchema>;

// ── Input constraints (must match backend env defaults) ────────────────────────

export const MIN_CHARS = 0;
export const MAX_CHARS = 500_000;
export const MAX_UPLOAD_MB = 10;
