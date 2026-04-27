export type GrantInputType =
  | "text"
  | "email"
  | "number"
  | "tel"
  | "url"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "date"
  | "rich_text"
  | "autocomplete"
  | "range"
  | "hidden"
  | "unknown";

export type GrantFieldValueSource =
  | "user_profile"
  | "generated_answer"
  | "uploaded_document"
  | "human_review"
  | "system";

export interface GrantFormField {
  field_id: string;
  label: string;
  aliases?: string[];
  input_type: GrantInputType;
  html_input_type?: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  help_text?: string;
  value?: string | number | boolean | null;
  value_source: GrantFieldValueSource;
  confidence: number;
  requires_human_review?: boolean;
  recommended_selector?: string;
  playwright_selector_candidates?: {
    by_label?: string;
    by_placeholder?: string;
    by_name?: string;
    by_id?: string;
    by_css?: string;
    by_role?: string;
  };
  validation?: {
    min_length?: number | null;
    max_length?: number | null;
    min?: number | null;
    max?: number | null;
    pattern?: string | null;
    accepted_file_types?: string[];
    max_file_size?: string | null;
  };
  conditional_logic?: {
    is_conditional: boolean;
    appears_when?: string;
    depends_on_field?: string;
  };
  notes?: string;
}

export interface GrantFormSection {
  section_id: string;
  section_title: string;
  page_index?: number;
  order: number;
  fields: GrantFormField[];
}

export interface GrantFormSchema {
  form_metadata: {
    url: string;
    grant_name?: string;
    provider?: string;
    requires_login: boolean;
    multi_step: boolean;
    captcha_detected: boolean;
    otp_required: boolean;
    language?: string;
    detected_pages?: string[];
  };
  sections: GrantFormSection[];
  attachments?: GrantFormField[];
  buttons?: { label: string; selector?: string; type?: string; risk?: string }[];
  automation_risks?: string[];
  recommended_next_action?: string;
}
