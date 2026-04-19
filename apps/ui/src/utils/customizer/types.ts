/**
 * OpenSCAD Customizer Type Definitions
 */

export type ParameterType =
  | 'number' // Simple number with spinbox
  | 'slider' // Number with slider (has range)
  | 'dropdown' // String or number with predefined options
  | 'boolean' // Checkbox
  | 'string' // Text input
  | 'vector'; // Array of numbers

export type ParameterProminence = 'primary' | 'secondary' | 'advanced';
export type CustomizerParamSource = 'standard' | 'hybrid';
export type CustomizerStringInput = 'text' | 'textarea';

export interface DropdownOption {
  value: string | number;
  label: string;
}

export interface CustomizerParam {
  name: string;
  type: ParameterType;
  value: string | number | boolean | number[];

  // For sliders
  min?: number;
  max?: number;
  step?: number;

  // For dropdowns
  options?: DropdownOption[];

  // Metadata
  line: number; // Line number in source code
  tab?: string; // Tab name (from /* [Tab Name] */ comments)
  group?: string; // Group name for UI presentation
  label?: string; // Friendly display label
  description?: string; // Optional helper text
  unit?: string; // Optional display unit
  prominence?: ParameterProminence; // Primary/secondary/advanced emphasis
  source?: CustomizerParamSource; // Metadata source used for this parameter
  input?: CustomizerStringInput; // Preferred string control presentation
  rows?: number; // Preferred textarea row count for large text inputs

  // Raw text for replacement
  rawValue: string; // Original value as string (e.g., "10", "true", "[1,2,3]")

  // Byte offsets of the value token in the source (from tree-sitter AST)
  valueStartIndex?: number;
  valueEndIndex?: number;
}

export interface CustomizerTab {
  name: string;
  params: CustomizerParam[];
}
