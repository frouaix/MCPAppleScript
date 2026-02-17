export interface ExecutorRequest {
  requestId: string;
  bundleId: string;
  mode: "template" | "raw";
  templateId?: string;
  script?: string;
  parameters: Record<string, unknown>;
  timeoutMs: number;
}

export interface ExecutorSuccessResponse {
  requestId: string;
  ok: true;
  result: Record<string, unknown>;
  stdout: string;
  stderr: string;
}

export interface ExecutorErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ExecutorErrorResponse {
  requestId: string;
  ok: false;
  error: ExecutorErrorDetail;
}

export type ExecutorResponse = ExecutorSuccessResponse | ExecutorErrorResponse;
