# OpenSCAD Formatter Architecture

This document describes the architecture of the OpenSCAD code formatter built for the OpenSCAD Studio application.

## Overview

The formatter is a **tree-sitter based** formatter that uses the [tree-sitter-openscad](https://github.com/bollian/tree-sitter-openscad) grammar to parse OpenSCAD code into an Abstract Syntax Tree (AST), then formats it using a Prettier-inspired document intermediate representation (IR).

## Architecture Components

### 1. Parser Layer (`parser.ts`)

**Location**: `apps/ui/src/utils/formatter/parser.ts`

The parser layer is responsible for:
- Initializing the web-tree-sitter WASM runtime
- Loading the OpenSCAD language grammar
- Parsing OpenSCAD source code into syntax trees

```typescript
// Initialization
await initParser();

// Parsing
const tree = parse(sourceCode);
```

**Key Implementation Details**:
- Uses `web-tree-sitter` for browser-compatible parsing
- WASM files must be served from the public directory
- Configured with `locateFile` to find WASM files at runtime
- Singleton pattern - parser initialized once and reused

### 2. Document IR Layer (`doc.ts`)

**Location**: `apps/ui/src/utils/formatter/doc.ts`

The Document IR provides primitives for building formatted output with intelligent line breaking. Inspired by [Prettier's Doc format](https://prettier.io/docs/en/printer.html).

**IR Primitives**:
- `concat(parts)` - Concatenate multiple docs
- `line()` - Breakable line (space in flat mode, newline in break mode)
- `hardline()` - Forced line break
- `softline()` - Line break only if needed
- `indent(contents)` - Increase indentation level
- `group(contents)` - Try to fit on one line, break if needed
- `join(separator, parts)` - Join array with separator

**Example**:
```typescript
group(concat([
  '{',
  indent(concat([hardline(), statement, ';'])),
  hardline(),
  '}',
]))
```

### 3. Printer Layer (`printer.ts`)

**Location**: `apps/ui/src/utils/formatter/printer.ts`

The printer layer converts the AST into formatted code by:
1. Walking the syntax tree recursively
2. Generating Document IR for each node type
3. Converting the final Doc IR to a string

**Main Functions**:

#### `printTree(tree, options)`
Entry point that prints the entire tree.

#### `printNode(node, options)`
Dispatches to specific node handlers based on node type.

**Supported Node Types**:
- `source_file` - Top-level file
- `module_declaration` - Module definitions
- `function_declaration` - Function definitions
- `block` / `union_block` - Code blocks with braces
- `transform_chain` - OpenSCAD transform chains (e.g., `translate() { ... }`)
- `module_call` / `function_call` - Function/module calls
- `assignment` - Variable assignments
- `binary_expression` - Binary operators
- `unary_expression` - Unary operators (like `-1`)
- `for_statement` - For loops
- `if_statement` - If statements
- `list` / `vector` / `array` - Array literals
- `arguments` - Function/module arguments
- Literals: `identifier`, `number`, `decimal`, `integer`, `string`, `boolean`, `comment`

#### `printDoc(doc, options)`
Converts the Document IR to the final formatted string, handling indentation and line breaks.

## WASM File Generation

The formatter requires two WASM files in the `apps/ui/public/` directory:

### 1. `tree-sitter.wasm`
The core tree-sitter runtime.

**Source**: Copied from the `web-tree-sitter` npm package.

```bash
cp node_modules/web-tree-sitter/tree-sitter.wasm apps/ui/public/
```

### 2. `tree-sitter-openscad.wasm`
The OpenSCAD language grammar compiled to WASM.

**Generation Steps**:

1. **Install Prerequisites**:
   ```bash
   # Install tree-sitter CLI
   brew install tree-sitter

   # Install emscripten for WASM compilation
   brew install emscripten
   ```

2. **Clone the Grammar Repository**:
   ```bash
   git clone https://github.com/bollian/tree-sitter-openscad.git
   cd tree-sitter-openscad
   ```

3. **Build WASM**:
   ```bash
   tree-sitter build --wasm
   ```

   This generates `tree-sitter-openscad.wasm` in the current directory.

4. **Copy to Project**:
   ```bash
   cp tree-sitter-openscad.wasm /path/to/openscad-tauri/apps/ui/public/
   ```

**Alternative Method** (without cloning):

If you have `tree-sitter-openscad` as a dependency:

```bash
cd node_modules/tree-sitter-openscad
tree-sitter build --wasm
cp tree-sitter-openscad.wasm ../../apps/ui/public/
```

## Integration with Monaco Editor

**Location**: `apps/ui/src/components/Editor.tsx`

The formatter integrates with Monaco through two mechanisms:

### 1. Document Formatting Provider

Registered on editor mount:

```typescript
monaco.languages.registerDocumentFormattingEditProvider('openscad', {
  provideDocumentFormattingEdits: async (model) => {
    const text = model.getValue();
    const formatted = await formatOpenScadCode(text, {
      indentSize: settings.editor.indentSize,
      useTabs: settings.editor.useTabs,
    });

    return [{
      range: model.getFullModelRange(),
      text: formatted,
    }];
  },
});
```

### 2. Keyboard Shortcuts

- **Cmd+Shift+F / Ctrl+Shift+F**: Manual format (always formats)
- **Cmd+S / Ctrl+S**: Save with format (if "Format on Save" setting is enabled)

## Configuration Options

```typescript
interface FormatOptions {
  indentSize?: number;    // Default: 4
  useTabs?: boolean;      // Default: false
  printWidth?: number;    // Default: 80 (not yet implemented)
}
```

## Formatting Rules

### Semicolons
- Added after assignments: `x = 10;`
- Added after transform chains without blocks: `cube([10, 10, 10]);`
- **Not** added after transform chains with blocks: `difference() { ... }` (no `;`)

### Spacing
- Binary operators: `x + y`, `a * b`
- Unary minus (no space): `-1`, `-x`
- Function calls: `cube([10, 10, 10])`
- Arguments: `foo(a, b, c)` (comma + space)
- For loops: `for (i = [0:10])` (space after `for`)

### Indentation
- Blocks indented by `indentSize` spaces (or tabs if `useTabs: true`)
- Closing braces aligned with opening statement
- Multi-line arrays indented properly

### Blank Lines
- Preserved between comment sections and code
- Added between top-level module/function declarations

## Known Issues

This section documents bugs and issues discovered during comprehensive testing with the official OpenSCAD examples (113 test cases from 48 example files).

### Critical Bugs (Break Code - Must Fix)

#### 1. Non-Idempotent Formatting - Statement Merging
**Severity**: Critical
**Status**: Open
**Affected Files**: `basics/logo.scad`

**Description**: Formatting the same code multiple times produces different results. In some cases, separate statements on adjacent lines get merged into a single line.

**Example**:
```openscad
// Original (formatted once)
cylinder(d=hole, h=cylinderHeight, center=true);
#rotate([90, 0, 0]) cylinder(d=hole, h=cylinderHeight, center=true);

// After formatting again (non-idempotent!)
cylinder(d=hole, h=cylinderHeight, center=true);#rotate([90, 0, 0]) cylinder(d=hole, h=cylinderHeight, center=true);
```

**Root Cause**: Likely missing hardline after statements in certain contexts.

#### 2. Non-Idempotent Formatting - File Truncation
**Severity**: Critical
**Status**: Open
**Affected Files**: `basics/logo_and_text.scad`, `basics/CSG-modules.scad`

**Description**: On repeated formatting, portions of the file get truncated, causing progressive data loss.

**Root Cause**: Unknown - possibly related to EOF handling or tree traversal terminating early.

#### 3. If Statement Bodies Dropped (No Braces)
**Severity**: Critical
**Status**: Open
**Affected Files**: `old/example001.scad`, `old/example021.scad`, `old/example022.scad`, `old/example024.scad`

**Description**: When an if statement doesn't have braces, the child statement is lost during formatting.

**Example**:
```openscad
// Original
if (type == 1) rotate(i*360/n) polygon([...]);

// Formatted (BROKEN!)
if (type == 1)  // polygon call is lost!
```

**Root Cause**: `printIfStatement()` in printer.ts:351 doesn't handle brace-less if statements properly.

#### 4. Single-Line Module Definitions Lose Child Calls
**Severity**: Critical
**Status**: Open
**Affected Files**: `advanced/GEB.scad`

**Description**: Module declarations without braces that have child transform chains lose their body.

**Example**:
```openscad
// Original
module G() offset(0.3) text("G", font = "Bitstream Vera Sans:style=Bold", halign = "center", valign = "center", size = 10);

// Formatted (BROKEN!)
module G()  // body is lost!
```

**Root Cause**: `printModuleDeclaration()` in printer.ts:186 only handles blocks, not brace-less module bodies.

#### 5. Missing Newlines Before Comments
**Severity**: Critical
**Status**: Open
**Affected Files**: Multiple files in `old/` directory

**Description**: Comments that should be on their own line get concatenated to the previous statement, causing progressive syntax errors on each format pass.

**Example**:
```openscad
// Original
cube(10);
// This is a comment

// Formatted (BROKEN!)
cube(10);// This is a comment
```

**Root Cause**: `printSourceFile()` in printer.ts:143 doesn't ensure hardline before comments.

### Major Issues (Affect Readability)

#### 6. Line Offset Issue
**Severity**: Major
**Status**: Open
**Affected Files**: All files in `advanced/` directory, many in `old/`

**Description**: All content is shifted up by 1-2 lines in the output. Line 2 content appears on line 1, line 3 on line 2, etc.

**Example**:
```
Expected Line 2: ""
Actual Line 2:   "// Size of edge"

Expected Line 3: "// Size of edge"
Actual Line 3:   "D = 100;"
```

**Root Cause**: Likely incorrect hardline handling at the start of `printSourceFile()` or missing initial newline.

#### 7. Multi-Line Transformation Chains Collapsed
**Severity**: Major
**Status**: Open
**Affected Files**: `basics/projection.scad`, multiple `old/` files

**Description**: Deeply nested transformation chains that were intentionally formatted across multiple lines get collapsed to single lines, hurting readability.

**Example**:
```openscad
// Original (readable)
color("red")
    translate([0, 0, -20])
        linear_extrude(height = 2, center = true)
            difference() { ... }

// Formatted (hard to read)
color("red") translate([0, 0, -20]) linear_extrude(height = 2, center = true) difference() { ... }
```

**Root Cause**: `printTransformChain()` in printer.ts:445 doesn't preserve original multi-line formatting.

### Style Differences (May Update Expected Files)

These are consistent formatting differences that may be acceptable - we need to decide whether to:
1. Update expected test files to match formatter output, OR
2. Add configuration options for style preferences

#### 8. Brace Style
- **Expected**: K&R style (opening brace on next line)
- **Actual**: One True Brace style (opening brace on same line)

```openscad
// Expected (K&R)
module foo()
{
  ...
}

// Actual (1TBS)
module foo() {
  ...
}
```

#### 9. Indentation Width
- **Expected**: 2 spaces (many `old/` examples)
- **Actual**: 4 spaces (default setting)

#### 10. Operator Spacing
- **Expected**: No spaces in some contexts (`360*i/6`, `center=true`)
- **Actual**: Spaces around all binary operators (`360 * i / 6`, `center = true`)

#### 11. Named Parameter Spacing
- **Expected**: No space around `=` (`center=true`)
- **Actual**: Spaces around `=` (`center = true`)

#### 12. Child Statement Placement
- **Expected**: Sometimes on same line as parent
- **Actual**: New line after opening brace

## Known Limitations

1. **Blank lines within blocks**: Currently not preserved. The formatter doesn't track original line spacing within function bodies.

2. **Complex expressions**: Very long expressions might not wrap optimally.

3. **Comments**: Inline comments are preserved but not reformatted.

4. **Print width**: The `printWidth` option exists but line breaking based on width is not yet implemented.

## Debugging

Enable debug logs by checking the browser console. The formatter logs:
- Unknown node types encountered
- Module/function declaration processing
- Array/list formatting decisions

Example log output:
```
[Formatter] Unknown node type: "foo", text: "..."
[Formatter] Unary expression: operator="-", operand="1"
[Formatter] List has 3 items
```

## Performance Considerations

- **Parser initialization**: Lazy - only initialized on first format
- **WASM loading**: Cached by browser after first load
- **AST parsing**: Fast for typical OpenSCAD files (< 1000 lines)
- **Tree cleanup**: Trees are `.delete()`'d after formatting to free memory

## Future Improvements

1. **Preserve blank lines**: Track original line numbers and preserve intentional spacing
2. **Line width wrapping**: Implement intelligent line breaking for long expressions
3. **Comment formatting**: Better handling of comment placement and alignment
4. **Configuration UI**: Allow users to customize formatting rules
5. **Format on type**: Optional formatting as you type (currently disabled)

## Dependencies

- **web-tree-sitter** (v0.25.10): WASM bindings for tree-sitter
- **tree-sitter-openscad** (v0.5.1): OpenSCAD grammar
- **License**: Both are MIT licensed, compatible with this project

## References

- [Tree-sitter Documentation](https://tree-sitter.github.io/tree-sitter/)
- [tree-sitter-openscad Grammar](https://github.com/bollian/tree-sitter-openscad)
- [Prettier's Doc Format](https://prettier.io/docs/en/printer.html)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/index.html)
