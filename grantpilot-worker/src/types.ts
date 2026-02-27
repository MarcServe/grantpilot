export type SessionStatus = "running" | "paused" | "completed" | "failed" | "resumed";
export type ItemStatus = "pending" | "processing" | "done" | "failed" | "skipped";

export type TaskType =
  | "csv_extraction"
  | "grant_application"
  | "form_filling";

export interface CuSession {
  id: number;
  public_id: string;
  task_type: TaskType;
  status: SessionStatus;
  total_items: number;
  processed_items: number;
  last_checkpoint: string | null;
  organisation_id: string | null;
  business_profile_id: string | null;
  error_log: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CuSessionItem {
  id: number;
  session_id: number;
  task_type: string | null;
  url: string | null;
  email: string | null;
  company_name: string | null;
  phone: string | null;
  extra_data: unknown | null;
  grant_id: string | null;
  grant_name: string | null;
  grant_url: string | null;
  application_status: string | null;
  action: string | null;
  status: ItemStatus;
  retry_count: number;
  error_message: string | null;
  screenshot_url: string | null;
  processed_at: string | null;
  created_at: string;
}
