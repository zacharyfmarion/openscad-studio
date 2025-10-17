# Formatter Test Suite

This directory contains file-based tests for the OpenSCAD formatter.

## Structure

```
__tests__/
├── formatter.test.ts          # Main test runner
├── test-utils.ts              # Test helper utilities
├── fixtures/                  # Test case files
│   ├── basic/                 # Basic formatting tests
│   ├── arrays/                # Array formatting tests
│   ├── parameters/            # Parameter formatting tests
│   ├── control-flow/          # Control flow tests
│   └── complex/               # Real-world complex examples
└── README.md                  # This file
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run only formatter tests
pnpm test:formatter

# Run tests in watch mode
pnpm test:watch
```

## Adding New Tests

To add a new test case:

1. Create two files in the appropriate `fixtures/` subdirectory:
   - `test-name.scad` - The input code to be formatted
   - `test-name.expected.scad` - The expected formatted output

2. The test runner will automatically discover and run your test

### Example

**fixtures/basic/my-test.scad**:
```openscad
module   example  (  x  )  {
cube(x);
}
```

**fixtures/basic/my-test.expected.scad**:
```openscad
module example(x) {
    cube(x);
}
```

That's it! The test suite will:
- Automatically discover your test
- Format the input
- Compare with expected output
- Test idempotence (formatting twice gives same result)

## Test Categories

### basic/
Basic language constructs:
- Simple modules
- Function declarations
- Comments
- Assignments

### arrays/
Array formatting:
- Single-line arrays: `[1, 2, 3]`
- Multiline arrays with proper indentation
- Nested arrays

### parameters/
Parameter lists:
- Single-line parameters: `module test(a, b, c)`
- Multiline parameters with indentation

### control-flow/
Control structures:
- For loops
- If/else statements
- Blank line preservation

### complex/
Real-world examples:
- Gear module
- Complex nested structures
- Mixed formatting scenarios

## Idempotence Testing

Every test automatically checks that the formatter is idempotent:

```
format(format(input)) === format(input)
```

This ensures that formatting code multiple times produces stable output.

## Debugging Failed Tests

When a test fails, you'll see:
1. The test name
2. A line-by-line diff showing Expected vs Actual
3. The specific lines that differ

Example failure output:
```
Formatting mismatch for arrays/multiline:

Expected vs Actual:
==================
Line 2:
  Expected: "    [0, 0],"
  Actual:   "    [ 0, 0 ],"
```

## WASM Support

The tests run in Node.js, so the parser is configured to load WASM files from the filesystem rather than HTTP. The parser automatically detects whether it's running in Node or browser and adjusts accordingly.
