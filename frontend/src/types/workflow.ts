export interface WorkflowField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'file';
  required?: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
  default_value?: any;
  help?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  title: string;
  description: string;
  fields: WorkflowField[];
}
