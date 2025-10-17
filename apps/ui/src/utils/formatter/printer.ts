/**
 * Tree-sitter based printer for OpenSCAD
 *
 * Converts AST to formatted code using the Doc IR
 */

import type * as TreeSitter from 'web-tree-sitter';
import type { FormatOptions } from './index';
import { concat, hardline, indent, line, group, join } from './doc';
import type { Doc } from './doc';

/**
 * Print a tree-sitter syntax tree as formatted code
 */
export function printTree(tree: TreeSitter.Tree, options: Required<FormatOptions>): string {
  const doc = printNode(tree.rootNode, options);
  return printDoc(doc, options);
}

/**
 * Print a single AST node
 */
function printNode(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const { type, text } = node;

  // Debug log for unhandled node types
  if (!['source_file', 'module_declaration', 'function_declaration', 'block', 'union_block',
        'if_statement', 'if_block', 'for_statement', 'for_block', 'assignment', 'binary_expression',
        'unary_expression', 'call_expression', 'module_call', 'function_call',
        'transform_chain', 'arguments', 'parameters_declaration', 'parameter', 'parenthesized_assignments',
        'parenthesized_expression', 'ternary_expression', 'index_expression', 'dot_index_expression',
        'list', 'vector', 'array', 'range', 'list_comprehension', 'for_clause',
        'comment', 'identifier', 'number', 'decimal', 'integer', 'float', 'string', 'boolean',
        'special_variable', 'use_statement', 'include_statement', 'include_path',
        'assert_statement', 'assert_expression',
        'modifier', 'modifier_chain', 'intersection_for', 'intersection_for_block',
        'use', 'if', 'else', 'module',
        '(', ')', '[', ']', '{', '}', ',', ';', '=', ':', 'for', 'whitespace', '\n',
        '$', '.', '#', '%', '?', '!'].includes(type)) {
    console.log(`[Formatter] Unknown node type: "${type}", text: "${text.substring(0, 50)}"`);
  }

  // Handle different node types
  switch (type) {
    case 'source_file':
      return printSourceFile(node, options);

    case 'module_declaration':
      return printModuleDeclaration(node, options);

    case 'function_declaration':
      return printFunctionDeclaration(node, options);

    case 'block':
    case 'union_block':
      return printBlock(node, options);

    case 'if_statement':
    case 'if_block':
      return printIfStatement(node, options);

    case 'for_statement':
    case 'for_block':
      return printForStatement(node, options);

    case 'intersection_for':
    case 'intersection_for_block':
      return printIntersectionFor(node, options);

    case 'assignment':
      return printAssignment(node, options);

    case 'binary_expression':
      return printBinaryExpression(node, options);

    case 'unary_expression':
      return printUnaryExpression(node, options);

    case 'call_expression':
    case 'module_call':
    case 'function_call':
      return printCallExpression(node, options);

    case 'transform_chain':
      return printTransformChain(node, options);

    case 'arguments':
      return printArguments(node, options);

    case 'list':
    case 'vector':
    case 'array':
      return printList(node, options);

    case 'range':
      return printRange(node, options);

    case 'list_comprehension':
      return printListComprehension(node, options);

    case 'for_clause':
      return printForClause(node, options);

    case 'ternary_expression':
      return printTernaryExpression(node, options);

    case 'index_expression':
      return printIndexExpression(node, options);

    case 'dot_index_expression':
      return printDotIndexExpression(node, options);

    case 'parenthesized_expression':
      return printParenthesizedExpression(node, options);

    case 'use_statement':
      return printUseStatement(node, options);

    case 'assert_statement':
    case 'assert_expression':
      return printAssert(node, options);

    case 'modifier_chain':
      return printModifierChain(node, options);

    case 'comment':
      return text;

    case 'parameter':
    case 'identifier':
    case 'number':
    case 'decimal':
    case 'integer':
    case 'float':
    case 'string':
    case 'boolean':
    case 'special_variable':
      return text;

    default:
      // For unknown nodes, try to print children or fall back to text
      if (node.childCount > 0) {
        return printChildren(node, options);
      }
      return text;
  }
}

function printSourceFile(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];
  let prevChild: TreeSitter.Node | null = null;

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    // Skip whitespace nodes and semicolons (we'll add them ourselves)
    if (child.type === 'whitespace' || child.type === '\n' || child.type === ';') {
      continue;
    }

    // Check if this is an inline comment (comment on same line as previous statement)
    const isInlineComment = child.type === 'comment' && prevChild &&
                            child.startPosition.row === prevChild.endPosition.row;

    if (isInlineComment) {
      // Preserve the original spacing before the inline comment
      // In the AST, prevChild ends before the semicolon, and child (comment) includes whitespace before it
      // We need to calculate: (comment start column) - (prevChild end column) - 1 (for semicolon we added)
      const prevEndCol = prevChild.endPosition.column;
      const commentStartCol = child.startPosition.column;
      const spacingBefore = commentStartCol - prevEndCol - 1; // -1 for the semicolon
      const spacing = ' '.repeat(Math.max(2, spacingBefore));
      parts.push(spacing, printNode(child, options));
      parts.push(hardline());
      prevChild = child;
      continue;
    }

    const childDoc = printNode(child, options);

    // Check if there was a blank line before this child in the original code
    let blankLineBefore = false;
    if (prevChild) {
      const lineDiff = child.startPosition.row - prevChild.endPosition.row;
      blankLineBefore = lineDiff > 1;
    }

    // Add blank line if there was one in the original
    if (blankLineBefore && i > 0) {
      parts.push(hardline());
    }

    parts.push(childDoc);

    // Add semicolon for statements that need it
    if (needsSemicolon(child.type, child)) {
      parts.push(';');
    }

    // Check if next child is an inline comment on the same line
    // If so, don't add hardline yet
    let nextChild: TreeSitter.Node | null = null;
    for (let j = i + 1; j < node.childCount; j++) {
      const nc = node.child(j);
      if (nc && nc.type !== 'whitespace' && nc.type !== '\n' && nc.type !== ';') {
        nextChild = nc;
        break;
      }
    }

    const nextIsInlineComment = nextChild && nextChild.type === 'comment' &&
                                nextChild.startPosition.row === child.endPosition.row;

    if (!nextIsInlineComment) {
      parts.push(hardline());
    }

    prevChild = child;
  }

  return concat(parts);
}

function printModuleDeclaration(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = ['module', ' '];  // Always add space after 'module'

  for (const child of node.children) {
    if (!child) continue;

    if (child.type === 'module') {
      // Skip the 'module' keyword itself
      continue;
    } else if (child.type === 'identifier') {
      parts.push(child.text);
    } else if (child.type === 'parameters_declaration') {
      parts.push(printParameters(child, options));
    } else if (child.type === 'block' || child.type === 'union_block') {
      parts.push(' ', printBlock(child, options));
    } else if (child.type === 'whitespace' || child.type === '\n' || child.type === ';') {
      // Skip
      continue;
    } else {
      // This handles module body without braces (transform chains, etc.)
      parts.push(' ', printNode(child, options));
    }
  }

  return concat(parts);
}

function printFunctionDeclaration(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = ['function'];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'identifier') {
      parts.push(' ', child.text);
    } else if (child.type === 'parameters_declaration') {
      parts.push(printParameters(child, options));
    } else if (child.type === '=') {
      parts.push(' ', child.text, ' ');
    } else if (child.type !== 'function') {
      parts.push(printNode(child, options));
    }
  }

  parts.push(';');
  return concat(parts);
}

function printParameters(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const params: Doc[] = [];
  let firstParamLine = -1;
  let lastParamLine = -1;

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === '(' || child.type === ')' || child.type === ',') {
      continue;
    }
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }

    // Track line positions to detect multiline parameters
    if (firstParamLine === -1) {
      firstParamLine = child.startPosition.row;
    }
    lastParamLine = child.endPosition.row;

    params.push(printNode(child, options));
  }

  if (params.length === 0) {
    return '()';
  }

  // Check if parameters were originally multiline
  const isMultiline = lastParamLine > firstParamLine;

  if (isMultiline) {
    // Format as multiline with Prettier-style formatting
    const parts: Doc[] = [];

    params.forEach((param, i) => {
      parts.push(param);
      if (i < params.length - 1) {
        parts.push(',');
        parts.push(hardline());
      }
    });

    return concat([
      '(',
      indent(concat([hardline(), ...parts])),
      hardline(),
      ')',
    ]);
  }

  // Keep single-line parameters compact
  return concat([
    '(',
    join(', ', params),
    ')',
  ]);
}

function printBlock(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const items: Array<{ stmt: Doc; needsSemi: boolean; blankLineBefore: boolean; child: TreeSitter.Node }> = [];
  let prevChild: TreeSitter.Node | null = null;

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === '{' || child.type === '}' || child.type === ';') {
      continue;
    }
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }

    const stmt = printNode(child, options);

    // Determine if this statement needs a semicolon
    let needsSemi = false;
    if (child.type === 'assignment') {
      needsSemi = true;
    } else if (child.type === 'assert_statement' || child.type === 'assert_expression') {
      needsSemi = true;
    } else if (child.type === 'transform_chain') {
      // Check if transform_chain ends with a block
      const hasBlock = hasChildOfType(child, 'union_block') || hasChildOfType(child, 'block');
      needsSemi = !hasBlock;
    } else if (child.type === 'modifier_chain') {
      // Check if modifier_chain ends with a block
      const hasBlock = hasChildOfType(child, 'union_block') || hasChildOfType(child, 'block');
      needsSemi = !hasBlock;
    } else if (child.type === 'module_call' || child.type === 'call_expression') {
      // Module/function calls without blocks need semicolons
      const hasBlock = hasChildOfType(child, 'union_block') || hasChildOfType(child, 'block');
      needsSemi = !hasBlock;
    } else if (child.type === 'module_declaration') {
      // Module declarations without blocks need semicolons
      const hasBlock = hasChildOfType(child, 'union_block') || hasChildOfType(child, 'block');
      needsSemi = !hasBlock;
    } else if (child.type === 'if_statement' || child.type === 'if_block') {
      // If statements - check if they need semicolons
      // If they have else, printIfStatement handles semicolons
      // Otherwise, need semicolons if no block
      const hasElse = hasChildOfType(child, 'else');
      if (!hasElse) {
        const hasBlock = hasChildOfType(child, 'union_block') || hasChildOfType(child, 'block');
        needsSemi = !hasBlock;
      }
    } else if (child.type === 'for_statement' || child.type === 'for_block') {
      // For statements without blocks need semicolons
      const hasBlock = hasChildOfType(child, 'union_block') || hasChildOfType(child, 'block');
      needsSemi = !hasBlock;
    } else if (child.type === 'intersection_for' || child.type === 'intersection_for_block') {
      // Intersection_for without blocks need semicolons
      const hasBlock = hasChildOfType(child, 'union_block') || hasChildOfType(child, 'block');
      needsSemi = !hasBlock;
    }

    // Check if there was a blank line before this statement in the original code
    let blankLineBefore = false;
    if (prevChild) {
      const lineDiff = child.startPosition.row - prevChild.endPosition.row;
      blankLineBefore = lineDiff > 1;
    }

    items.push({ stmt, needsSemi, blankLineBefore, child });
    prevChild = child;
  }

  if (items.length === 0) {
    return '{}';
  }

  const statements: Doc[] = [];
  items.forEach(({ stmt, needsSemi, blankLineBefore }, i) => {
    // Add blank line if there was one in the original
    if (blankLineBefore && i > 0) {
      statements.push(hardline());
    }

    statements.push(stmt);
    if (needsSemi) {
      statements.push(';');
    }

    // Add hardline after each statement except the last
    if (i < items.length - 1) {
      statements.push(hardline());
    }
  });

  return group(concat([
    '{',
    indent(concat([hardline(), ...statements])),
    hardline(),
    '}',
  ]));
}

function printIfStatement(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = ['if'];
  let hasElse = false;
  let seenElse = false;
  let conditionEndRow = -1;

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'if') {
      continue;
    } else if (child.type === 'condition' || child.type === 'parenthesized_expression') {
      const conditionChild = child.children[1] || child;
      if (conditionChild) {
        parts.push(' (', printNode(conditionChild, options), ')');
      }
      conditionEndRow = child.endPosition.row;
    } else if (child.type === 'block' || child.type === 'union_block') {
      parts.push(' ', printNode(child, options));
    } else if (child.type === 'else') {
      // Add semicolon before else if we're not in a block
      if (!hasChildOfType(node, 'union_block') && !hasChildOfType(node, 'block')) {
        parts.push(';');
      }
      parts.push(' else');
      hasElse = true;
      seenElse = true;
    } else if (child.type === 'whitespace' || child.type === '\n' || child.type === ';') {
      // Skip
      continue;
    } else {
      // This handles any statement/expression in the if body (without braces)
      // Check if body is on a new line
      const isMultiline = conditionEndRow >= 0 && child.startPosition.row > conditionEndRow;

      if (isMultiline && !seenElse) {
        // Body on new line - add newline and indent
        parts.push(indent(concat([hardline(), printNode(child, options)])));
      } else {
        // Body on same line
        parts.push(' ', printNode(child, options));
      }
    }
  }

  // Add final semicolon if there's an else clause (and no block)
  if (hasElse && !hasChildOfType(node, 'union_block') && !hasChildOfType(node, 'block')) {
    parts.push(';');
  }

  return concat(parts);
}

function printForStatement(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = ['for', ' '];
  let parensEndRow = -1;

  for (const child of node.children) {
    if (!child) continue;

    if (child.type === 'for') {
      // Skip the 'for' keyword itself
      continue;
    } else if (child.type === 'parenthesized_assignments') {
      // Print the parenthesized assignments (e.g., "(i = [0:10])")
      parts.push(printParenthesizedAssignments(child, options));
      parensEndRow = child.endPosition.row;
    } else if (child.type === 'block' || child.type === 'union_block') {
      parts.push(' ', printNode(child, options));
    } else if (child.type !== ';' && child.type !== 'whitespace' && child.type !== '\n') {
      // Check if body is on a new line
      const isMultiline = parensEndRow >= 0 && child.startPosition.row > parensEndRow;

      if (isMultiline) {
        // Body on new line - add newline and indent
        parts.push(indent(concat([hardline(), printNode(child, options)])));
      } else {
        // Body on same line
        parts.push(' ', printNode(child, options));
      }
    }
  }

  return concat(parts);
}

function printParenthesizedAssignments(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = ['('];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === '(' || child.type === ')') {
      continue;
    }
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    if (child.type === '=') {
      parts.push(' ', child.text, ' ');
    } else {
      parts.push(printNode(child, options));
    }
  }

  parts.push(')');
  return concat(parts);
}

function printAssignment(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (child.type === '=') {
      parts.push(' ', child.text, ' ');
    } else if (child.type === ';') {
      // Skip semicolons - they'll be added by printSourceFile
      continue;
    } else {
      parts.push(printNode(child, options));
    }
  }

  return concat(parts);
}

function printTransformChain(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];
  const calls: TreeSitter.Node[] = [];
  let firstCallLine = -1;
  let lastCallLine = -1;

  // Track line positions of module/function calls to detect multiline chains
  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'module_call' || child.type === 'function_call' || child.type === 'transform_chain') {
      calls.push(child);
      if (firstCallLine === -1) {
        firstCallLine = child.startPosition.row;
      }
      lastCallLine = child.endPosition.row;
    }
  }

  const isMultiline = lastCallLine > firstCallLine;

  for (const child of node.children) {
    if (!child) continue;

    if (child.type === 'module_call' || child.type === 'function_call') {
      // Check if this call is on a new line
      if (isMultiline && parts.length > 0 && child.startPosition.row > firstCallLine) {
        parts.push(indent(concat([hardline(), printCallExpression(child, options)])));
      } else {
        if (parts.length > 0) {
          parts.push(' ');
        }
        parts.push(printCallExpression(child, options));
      }
    } else if (child.type === 'union_block' || child.type === 'block') {
      parts.push(' ', printBlock(child, options));
    } else if (child.type === ';') {
      // Skip - semicolon handled by parent based on whether there's a block
      continue;
    } else if (child.type === 'transform_chain') {
      // Nested transform chain
      if (isMultiline && parts.length > 0 && child.startPosition.row > firstCallLine) {
        parts.push(indent(concat([hardline(), printTransformChain(child, options)])));
      } else {
        if (parts.length > 0) {
          parts.push(' ');
        }
        parts.push(printTransformChain(child, options));
      }
    } else {
      parts.push(printNode(child, options));
    }
  }

  return concat(parts);
}

function printBinaryExpression(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];

  for (const child of node.children) {
    if (!child) continue;
    if (isOperator(child.text)) {
      parts.push(' ', child.text, ' ');
    } else {
      parts.push(printNode(child, options));
    }
  }

  return concat(parts);
}

function printUnaryExpression(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const operator = node.child(0);
  const operand = node.child(1);

  if (!operator || !operand) {
    return node.text;
  }

  // Handle negative numbers/expressions (no space for minus)
  if (operator.text === '-') {
    return concat([operator.text, printNode(operand, options)]);
  }

  // Other unary operators (like !)
  return concat([operator.text, printNode(operand, options)]);
}

function printCallExpression(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'identifier') {
      parts.push(child.text);
    } else if (child.type === 'arguments') {
      parts.push(printArguments(child, options));
    } else if (child.type !== ';' && child.type !== 'whitespace' && child.type !== '\n') {
      parts.push(printNode(child, options));
    }
  }

  return concat(parts);
}

function printArguments(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const args: Doc[] = [];
  let firstArgLine = -1;
  let lastArgLine = -1;

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === '(' || child.type === ')' || child.type === ',') {
      continue;
    }
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }

    // Track line positions to detect multiline arguments
    if (firstArgLine === -1) {
      firstArgLine = child.startPosition.row;
    }
    lastArgLine = child.endPosition.row;

    args.push(printNode(child, options));
  }

  if (args.length === 0) {
    return '()';
  }

  // Check if arguments were originally multiline
  const isMultiline = lastArgLine > firstArgLine;

  if (isMultiline) {
    // Format as multiline with Prettier-style formatting
    const parts: Doc[] = [];

    args.forEach((arg, i) => {
      parts.push(arg);
      if (i < args.length - 1) {
        parts.push(',');
        parts.push(hardline());
      }
    });

    return concat([
      '(',
      indent(concat([hardline(), ...parts])),
      hardline(),
      ')',
    ]);
  }

  // Keep single-line arguments compact
  return concat([
    '(',
    join(', ', args),
    ')',
  ]);
}

function printList(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const items: Doc[] = [];
  const children: TreeSitter.Node[] = [];
  let firstItemLine = -1;
  let lastItemLine = -1;

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === '[' || child.type === ']' || child.type === ',') {
      continue;
    }
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }

    // Track line positions to detect multiline arrays
    if (firstItemLine === -1) {
      firstItemLine = child.startPosition.row;
    }
    lastItemLine = child.endPosition.row;

    children.push(child);
    items.push(printNode(child, options));
  }

  if (items.length === 0) {
    return '[]';
  }

  // Check if array was originally multiline
  const isMultiline = lastItemLine > firstItemLine;

  if (isMultiline && items.length > 0) {
    // Format as multiline with Prettier-style formatting
    // Each item on its own line with comma, closing bracket unindented
    const parts: Doc[] = [];

    items.forEach((item, i) => {
      parts.push(item);
      if (i < items.length - 1) {
        parts.push(',');
        parts.push(hardline());
      }
    });

    return concat([
      '[',
      indent(concat([hardline(), ...parts])),
      hardline(),
      ']',
    ]);
  }

  // Keep single-line arrays compact: [1, 2, 3] not [ 1, 2, 3 ]
  return concat([
    '[',
    join(', ', items),
    ']',
  ]);
}

function printRange(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    if (child.type === ':') {
      // Add spaces around colons in ranges: [0 : 10] not [0:10]
      parts.push(' ', child.text, ' ');
    } else {
      parts.push(printNode(child, options));
    }
  }

  return concat(parts);
}

function printListComprehension(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    parts.push(printNode(child, options));
  }

  return concat(parts);
}

function printForClause(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = ['for'];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'for') {
      // Already added
      continue;
    }
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    if (child.type === 'parenthesized_assignments') {
      parts.push(printParenthesizedAssignments(child, options));
    } else {
      // This is the expression after the for clause
      parts.push(' ', printNode(child, options));
    }
  }

  return concat(parts);
}

function printTernaryExpression(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];
  let firstChildLine = -1;
  let lastChildLine = -1;

  // Track line positions to detect multiline ternaries
  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    if (firstChildLine === -1) {
      firstChildLine = child.startPosition.row;
    }
    lastChildLine = child.endPosition.row;
  }

  const isMultiline = lastChildLine > firstChildLine;

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    if (child.type === '?') {
      if (isMultiline) {
        parts.push(indent(concat([hardline(), child.text, ' '])));
      } else {
        parts.push(' ', child.text, ' ');
      }
    } else if (child.type === ':') {
      if (isMultiline) {
        parts.push(indent(concat([hardline(), child.text, ' '])));
      } else {
        parts.push(' ', child.text, ' ');
      }
    } else {
      // Regular child node - just add it, indentation handled by ? and : above
      parts.push(printNode(child, options));
    }
  }

  return concat(parts);
}

function printIndexExpression(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    parts.push(printNode(child, options));
  }

  return concat(parts);
}

function printDotIndexExpression(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    parts.push(printNode(child, options));
  }

  return concat(parts);
}

function printParenthesizedExpression(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = ['('];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === '(' || child.type === ')') {
      continue;
    }
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    parts.push(printNode(child, options));
  }

  parts.push(')');
  return concat(parts);
}

function printUseStatement(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    if (child.type === 'use') {
      parts.push(child.text, ' ');
    } else if (child.type === 'include_path') {
      parts.push(child.text);
    } else {
      parts.push(printNode(child, options));
    }
  }

  return concat(parts);
}

function printAssert(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = ['assert', '('];
  const args: Doc[] = [];
  let afterParens: Doc | null = null;
  let seenCloseParen = false;

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'assert') {
      continue;
    }
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    if (child.type === '(') {
      continue;
    }
    if (child.type === ')') {
      seenCloseParen = true;
      continue;
    }
    if (child.type === ';') {
      continue;
    }
    if (child.type === ',') {
      continue;
    }

    // If we've seen the closing paren, this is the expression after assert
    if (seenCloseParen) {
      afterParens = printNode(child, options);
    } else {
      args.push(printNode(child, options));
    }
  }

  // Join arguments with comma and space
  parts.push(join(', ', args));
  parts.push(')');

  // Add expression after assert with a space
  if (afterParens) {
    parts.push(' ', afterParens);
  }

  return concat(parts);
}

function printModifierChain(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];

  for (const child of node.children) {
    if (!child) continue;
    if (child.type === 'whitespace' || child.type === '\n') {
      continue;
    }
    if (child.type === 'modifier') {
      // No space after modifier characters like %, #, !, *
      parts.push(child.text);
    } else if (child.type === 'module_call' || child.type === 'function_call' || child.type === 'transform_chain') {
      // Just add the node directly, no space before it
      parts.push(printNode(child, options));
    } else {
      parts.push(printNode(child, options));
    }
  }

  return concat(parts);
}

function printIntersectionFor(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = ['intersection_for', ' '];
  let block: Doc | null = null;

  for (const child of node.children) {
    if (!child) continue;

    if (child.type === 'intersection_for') {
      continue;
    } else if (child.type === 'parenthesized_assignments') {
      parts.push(printParenthesizedAssignments(child, options));
    } else if (child.type === 'block' || child.type === 'union_block') {
      block = printNode(child, options);
    } else if (child.type !== ';' && child.type !== 'whitespace' && child.type !== '\n') {
      parts.push(printNode(child, options));
    }
  }

  if (block) {
    parts.push(' ', block);
  }

  return concat(parts);
}

function printChildren(node: TreeSitter.Node, options: Required<FormatOptions>): Doc {
  const parts: Doc[] = [];

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    parts.push(printNode(child, options));
  }

  return concat(parts);
}

// Helper functions

function needsSemicolon(type: string, node?: TreeSitter.Node): boolean {
  if (type === 'assignment') {
    return true;
  }
  if (type === 'assert_statement' || type === 'assert_expression') {
    return true;
  }
  if (type === 'transform_chain' && node) {
    // Only add semicolon if transform chain doesn't have a block
    const hasBlock = hasChildOfType(node, 'union_block') || hasChildOfType(node, 'block');
    return !hasBlock;
  }
  if (type === 'modifier_chain' && node) {
    // Modifier chains without blocks need semicolons (like #rotate(...) cylinder(...);)
    const hasBlock = hasChildOfType(node, 'union_block') || hasChildOfType(node, 'block');
    return !hasBlock;
  }
  if (type === 'module_declaration' && node) {
    // Module declarations without blocks need semicolons
    const hasBlock = hasChildOfType(node, 'union_block') || hasChildOfType(node, 'block');
    return !hasBlock;
  }
  if (type === 'if_statement' || type === 'if_block') {
    // If statements with else need semicolons handled in printIfStatement
    // If statements without else and without blocks need semicolons
    if (node) {
      const hasElse = hasChildOfType(node, 'else');
      if (hasElse) {
        return false; // printIfStatement handles semicolons for if-else
      }
      const hasBlock = hasChildOfType(node, 'union_block') || hasChildOfType(node, 'block');
      return !hasBlock;
    }
    return false;
  }
  if (type === 'for_statement' || type === 'for_block') {
    // For statements need semicolons if they don't have blocks
    if (node) {
      const hasBlock = hasChildOfType(node, 'union_block') || hasChildOfType(node, 'block');
      return !hasBlock;
    }
  }
  if (type === 'intersection_for' || type === 'intersection_for_block') {
    // Intersection_for statements need semicolons if they don't have blocks
    if (node) {
      const hasBlock = hasChildOfType(node, 'union_block') || hasChildOfType(node, 'block');
      return !hasBlock;
    }
  }
  return false;
}

function hasChildOfType(node: TreeSitter.Node, type: string): boolean {
  for (const child of node.children) {
    if (child && child.type === type) {
      return true;
    }
  }
  return false;
}

function isOperator(text: string): boolean {
  return ['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!'].includes(text);
}

/**
 * Convert Doc IR to actual string output
 */
function printDoc(doc: Doc, options: Required<FormatOptions>, mode: 'flat' | 'break' = 'break'): string {
  const indentStr = options.useTabs ? '\t' : ' '.repeat(options.indentSize);
  let output = '';
  let indentLevel = 0;

  function print(d: Doc, m: 'flat' | 'break' = mode): void {
    if (typeof d === 'string') {
      output += d;
      return;
    }

    if (Array.isArray(d)) {
      for (const part of d) {
        print(part, m);
      }
      return;
    }

    switch (d.type) {
      case 'concat':
        for (const part of d.parts) {
          print(part, m);
        }
        break;

      case 'line':
        if (d.hard || m === 'break') {
          output += '\n' + indentStr.repeat(indentLevel);
        } else if (!d.soft) {
          output += ' ';
        }
        break;

      case 'group':
        print(d.contents, d.shouldBreak ? 'break' : 'flat');
        break;

      case 'indent':
        indentLevel++;
        print(d.contents, m);
        indentLevel--;
        break;

      case 'if-break':
        print(m === 'break' ? d.breakContents : d.flatContents, m);
        break;

      case 'fill':
        for (const part of d.parts) {
          print(part, m);
        }
        break;
    }
  }

  print(doc);

  // Remove trailing whitespace from each line and ensure single trailing newline
  let result = output.split('\n').map(line => line.trimEnd()).join('\n');

  // Ensure exactly one trailing newline (all text files should end with newline)
  // Unless the result is empty
  if (result.trim().length === 0) {
    return '';
  }
  result = result.replace(/\n*$/, '\n');

  return result;
}
