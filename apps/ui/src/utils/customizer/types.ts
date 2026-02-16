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
  group?: string; // Group name (optional future feature)

  // Raw text for replacement
  rawValue: string; // Original value as string (e.g., "10", "true", "[1,2,3]")
}

export interface CustomizerTab {
  name: string;
  params: CustomizerParam[];
}
