/**
 * OpenSCAD Customizer Parameter Parser
 *
 * Parses OpenSCAD source code to extract customizer parameters using tree-sitter.
 * Supports the official OpenSCAD customizer syntax.
 */

import { parse } from '../formatter/parser';
import type {
  CustomizerParam,
  CustomizerTab,
  ParameterType,
  DropdownOption,
  ParameterProminence,
  CustomizerParamSource,
} from './types';
import type * as TreeSitter from 'web-tree-sitter';

interface StudioMetadata {
  label?: string;
  description?: string;
  unit?: string;
  group?: string;
  prominence?: ParameterProminence;
}

const isDev = import.meta.env.DEV;

/**
 * Parse comment text to extract customizer configuration
 * Examples:
 *   "// [0:100]" -> slider with range 0-100
 *   "// [0:5:100]" -> slider with step 5
 *   "// [foo, bar, baz]" -> dropdown with string options
 *   "// [10:Small, 20:Medium, 30:Large]" -> dropdown with labeled values
 */
function parseCommentConfig(comment: string): {
  type: ParameterType;
  min?: number;
  max?: number;
  step?: number;
  options?: DropdownOption[];
} | null {
  // Extract content between [ and ]
  const match = comment.match(/\[([^\]]+)\]/);
  if (!match) return null;

  const content = match[1].trim();

  const booleanOptions = content
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (
    booleanOptions.length === 2 &&
    booleanOptions.every((option) => option === 'true' || option === 'false')
  ) {
    return { type: 'boolean' };
  }

  // Check for labeled dropdown: "10:Small, 20:Medium"
  if (content.includes(':') && content.includes(',')) {
    const parts = content.split(',').map((s) => s.trim());
    if (parts.every((p) => p.includes(':'))) {
      const labeledBooleanOptions = parts.map((part) => part.split(':')[0]?.trim().toLowerCase());
      if (
        labeledBooleanOptions.length === 2 &&
        labeledBooleanOptions.every((option) => option === 'true' || option === 'false')
      ) {
        return { type: 'boolean' };
      }

      const options = parts.map((part) => {
        const [val, label] = part.split(':').map((s) => s.trim());
        return {
          value: isNaN(Number(val)) ? val : Number(val),
          label: label || val,
        };
      });
      return { type: 'dropdown', options };
    }
  }

  // Check for range with step: "0:5:100"
  const rangeStepMatch = content.match(/^(-?\d+\.?\d*):(-?\d+\.?\d*):(-?\d+\.?\d*)$/);
  if (rangeStepMatch) {
    return {
      type: 'slider',
      min: Number(rangeStepMatch[1]),
      step: Number(rangeStepMatch[2]),
      max: Number(rangeStepMatch[3]),
    };
  }

  // Check for range without step: "0:100"
  const rangeMatch = content.match(/^(-?\d+\.?\d*):(-?\d+\.?\d*)$/);
  if (rangeMatch) {
    return {
      type: 'slider',
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
    };
  }

  // Check for simple max value (slider from 0 to max): "100"
  if (/^-?\d+\.?\d*$/.test(content)) {
    return {
      type: 'slider',
      min: 0,
      max: Number(content),
    };
  }

  // Check for string dropdown: "foo, bar, baz"
  if (content.includes(',')) {
    const options = content
      .split(',')
      .map((s) => s.trim())
      .map((val) => ({
        value: val,
        label: val,
      }));
    return { type: 'dropdown', options };
  }

  return null;
}

function parseStudioMetadata(commentText: string): StudioMetadata | null {
  const match = commentText.match(/\/\/\s*@studio\s+(\{.*\})\s*$/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    const metadata: StudioMetadata = {};

    if (typeof parsed.label === 'string') metadata.label = parsed.label;
    if (typeof parsed.description === 'string') metadata.description = parsed.description;
    if (typeof parsed.unit === 'string') metadata.unit = parsed.unit;
    if (typeof parsed.group === 'string') metadata.group = parsed.group;
    if (
      parsed.prominence === 'primary' ||
      parsed.prominence === 'secondary' ||
      parsed.prominence === 'advanced'
    ) {
      metadata.prominence = parsed.prominence;
    }

    return Object.keys(metadata).length > 0 ? metadata : null;
  } catch (error) {
    if (isDev) {
      console.warn('[Customizer] Ignoring invalid @studio metadata:', error);
    }
    return null;
  }
}

function isValidSliderConfig(
  value: string | number | boolean | number[],
  config: { min?: number; max?: number; step?: number }
): value is number {
  if (typeof value !== 'number') return false;
  if (config.min === undefined || config.max === undefined) return false;
  if (!Number.isFinite(config.min) || !Number.isFinite(config.max)) return false;
  if (config.min >= config.max) return false;
  if (config.step !== undefined && (!Number.isFinite(config.step) || config.step <= 0)) return false;
  if (value < config.min || value > config.max) return false;
  return true;
}

/**
 * Get trailing comment for a node (if it exists on the same line)
 */
function getTrailingComment(node: TreeSitter.Node, sourceCode: string): string | null {
  const line = node.endPosition.row;
  const lineEnd = sourceCode.split('\n')[line];
  if (!lineEnd) return null;

  const commentMatch = lineEnd.match(/\/\/(.*)$/);
  return commentMatch ? commentMatch[1].trim() : null;
}

/**
 * Extract value from an assignment node
 * Returns null if the value is not a simple literal (i.e., it's an expression)
 */
function extractValue(
  valueNode: TreeSitter.Node,
  sourceCode: string
): {
  value: string | number | boolean | number[];
  rawValue: string;
  inferredType: ParameterType;
} | null {
  const text = sourceCode.substring(valueNode.startIndex, valueNode.endIndex);
  const rawValue = text;

  // Skip expressions (binary operations, function calls, etc.)
  if (
    valueNode.type === 'binary_expression' ||
    valueNode.type === 'unary_expression' ||
    valueNode.type === 'call_expression' ||
    valueNode.type === 'function_call' ||
    valueNode.type === 'ternary_expression' ||
    valueNode.type === 'index_expression'
  ) {
    return null; // Not a simple literal
  }

  // Boolean
  if (valueNode.type === 'boolean' || text === 'true' || text === 'false') {
    return {
      value: text === 'true',
      rawValue,
      inferredType: 'boolean',
    };
  }

  // Vector/Array - only accept simple lists with literal values
  if (valueNode.type === 'list' || valueNode.type === 'vector') {
    // Check if all children are literals (no expressions)
    for (let i = 0; i < valueNode.childCount; i++) {
      const child = valueNode.child(i);
      if (
        child &&
        child.type !== '[' &&
        child.type !== ']' &&
        child.type !== ',' &&
        child.type !== 'number' &&
        child.type !== 'decimal' &&
        child.type !== 'integer' &&
        child.type !== 'float' &&
        child.type !== 'whitespace' &&
        child.type !== '\n'
      ) {
        return null; // Contains non-literal
      }
    }

    // Extract numbers from array
    const numbers = text.match(/-?\d+\.?\d*/g)?.map(Number) || [];
    return {
      value: numbers,
      rawValue,
      inferredType: 'vector',
    };
  }

  // String
  if (valueNode.type === 'string' || text.startsWith('"') || text.startsWith("'")) {
    return {
      value: text.replace(/^["']|["']$/g, ''),
      rawValue,
      inferredType: 'string',
    };
  }

  // Number (simple literal only)
  if (
    valueNode.type === 'number' ||
    valueNode.type === 'decimal' ||
    valueNode.type === 'integer' ||
    valueNode.type === 'float'
  ) {
    return {
      value: Number(text),
      rawValue,
      inferredType: 'number',
    };
  }

  // If we can't parse it as a number and it's not any known literal type, skip it
  return null;
}

/**
 * Parse OpenSCAD source code and extract customizer parameters
 */
export function parseCustomizerParams(sourceCode: string): CustomizerTab[] {
  const tree = parse(sourceCode);
  if (!tree) {
    console.warn('[Customizer] Failed to parse code');
    return [];
  }

  const params: CustomizerParam[] = [];
  let currentTab = 'Parameters'; // Default tab name
  let pendingStudioMetadata: StudioMetadata | null = null;

  try {
    // Walk the root node
    const cursor = tree.walk();
    const rootNode = tree.rootNode;

    // Look for top-level assignments before first module/function
    for (let i = 0; i < rootNode.childCount; i++) {
      const child = rootNode.child(i);
      if (!child) continue;

      // Stop at first module or function declaration
      if (child.type === 'module_declaration' || child.type === 'function_declaration') {
        break;
      }

      // Check for block (contains '{') - stop here as params must be before blocks
      if (child.type === 'block' || child.type === 'union_block') {
        break;
      }

      // Look for tab/group comments: /* [Tab Name] */
      if (child.type === 'comment') {
        const commentText = sourceCode.substring(child.startIndex, child.endIndex);
        const studioMetadata = parseStudioMetadata(commentText);
        if (studioMetadata !== null) {
          pendingStudioMetadata = studioMetadata;
          continue;
        }

        const tabMatch = commentText.match(/\/\*\s*\[([^\]]+)\]\s*\*\//);
        if (tabMatch) {
          const tabName = tabMatch[1].trim();
          // Skip [Hidden] tab
          if (tabName.toLowerCase() !== 'hidden') {
            currentTab = tabName;
          } else {
            // Skip subsequent params until next tab
            currentTab = '__hidden__';
          }
          pendingStudioMetadata = null;
          continue;
        }

        // Ignore unrelated comments without clearing pending metadata.
        continue;
      }

      // Look for assignments: variable = value;
      if (child.type === 'assignment') {
        // Skip if in hidden tab
        if (currentTab === '__hidden__') {
          pendingStudioMetadata = null;
          continue;
        }

        // Find identifier and value
        let identifier: TreeSitter.Node | null = null;
        let valueNode: TreeSitter.Node | null = null;

        for (let j = 0; j < child.childCount; j++) {
          const subChild = child.child(j);
          if (!subChild) continue;

          if (subChild.type === 'identifier' && !identifier) {
            identifier = subChild;
          } else if (
            subChild.type !== 'identifier' &&
            subChild.type !== '=' &&
            subChild.type !== ';'
          ) {
            valueNode = subChild;
          }
        }

        if (!identifier || !valueNode) continue;

        const name = sourceCode.substring(identifier.startIndex, identifier.endIndex);
        const extractedValue = extractValue(valueNode, sourceCode);

        // Skip if value is not a simple literal
        if (!extractedValue) continue;

        const { value, rawValue, inferredType } = extractedValue;

        // Check for trailing comment with config
        const trailingComment = getTrailingComment(child, sourceCode);
        const commentConfig = trailingComment ? parseCommentConfig(trailingComment) : null;

        const param: CustomizerParam = {
          name,
          value,
          rawValue,
          type: commentConfig?.type || inferredType,
          line: child.startPosition.row + 1, // 1-indexed
          tab: currentTab,
        };

        // Add range/options from comment if present
        if (commentConfig) {
          if (commentConfig.type === 'slider') {
            if (isValidSliderConfig(value, commentConfig)) {
              param.type = 'slider';
              param.min = commentConfig.min;
              param.max = commentConfig.max;
              if (commentConfig.step !== undefined) param.step = commentConfig.step;
            } else {
              param.type = inferredType;
            }
          } else if (commentConfig.type === 'boolean' && typeof value === 'boolean') {
            param.type = 'boolean';
          } else if (
            commentConfig.type === 'dropdown' &&
            (typeof value === 'string' || typeof value === 'number')
          ) {
            param.type = 'dropdown';
            if (commentConfig.options) param.options = commentConfig.options;
          }
        }

        if (pendingStudioMetadata) {
          if (pendingStudioMetadata.label) param.label = pendingStudioMetadata.label;
          if (pendingStudioMetadata.description) {
            param.description = pendingStudioMetadata.description;
          }
          if (pendingStudioMetadata.unit) param.unit = pendingStudioMetadata.unit;
          if (pendingStudioMetadata.group) param.group = pendingStudioMetadata.group;
          if (pendingStudioMetadata.prominence) {
            param.prominence = pendingStudioMetadata.prominence;
          }
        }

        const source: CustomizerParamSource | undefined = pendingStudioMetadata
          ? 'hybrid'
          : commentConfig
            ? 'standard'
            : undefined;
        if (source) {
          param.source = source;
        }

        params.push(param);
        pendingStudioMetadata = null;
        continue;
      }

      // Any non-comment, non-assignment top-level node breaks metadata association.
      pendingStudioMetadata = null;
    }

    cursor.delete();
  } finally {
    tree.delete();
  }

  // Group parameters by tab
  const tabMap = new Map<string, CustomizerParam[]>();
  for (const param of params) {
    const tabName = param.tab || 'Parameters';
    if (!tabMap.has(tabName)) {
      tabMap.set(tabName, []);
    }
    tabMap.get(tabName)!.push(param);
  }

  // Convert to array of tabs
  const tabs: CustomizerTab[] = [];
  for (const [name, params] of tabMap.entries()) {
    tabs.push({ name, params });
  }

  return tabs;
}
