export interface Row {
  [field: string]: string | number | null;
}

export type FieldType = "currency" | "number" | "string" | "date" | "url" | "enum";

export interface FieldContract {
  name: string;
  description: string;
  type: FieldType;
  currency?: string;
  pattern?: string;
  nullRate: { p50: number; max: number };
  numericRange?: { min: number; max: number };
  categoricalValues?: string[];
}

export type ViolationClass = "STRUCTURAL" | "SEMANTIC" | "DRIFT";

export interface Violation {
  class: ViolationClass;
  field: string;
  detail: string;
  evidence: { expected: string; observed: string; sampleRows: Row[] };
}
