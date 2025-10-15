import type * as Monaco from 'monaco-editor';

const LANGUAGE_ID = 'openscad';

const CONTROL_KEYWORDS = [
  'module',
  'function',
  'if',
  'else',
  'for',
  'each',
  'let',
  'assign',
  'intersection_for',
  'echo',
  'assert',
];

const DIRECTIVES = ['include', 'use'];
const LITERALS = ['true', 'false', 'undef'];

const BUILTIN_MODULES = [
  // 3D primitives
  'cube',
  'sphere',
  'cylinder',
  'polyhedron',
  // 2D primitives
  'square',
  'circle',
  'polygon',
  'text',
  // Boolean operations
  'union',
  'difference',
  'intersection',
  'hull',
  'minkowski',
  // Transformations
  'translate',
  'rotate',
  'rotate_extrude',
  'scale',
  'resize',
  'mirror',
  'multmatrix',
  'color',
  'offset',
  // Extrusions and surfaces
  'linear_extrude',
  'surface',
  'projection',
  // Other built-in modules
  'render',
  'children',
  'background',
  'group',
  'import',
  'import_dxf',
  'import_stl',
  'import_off',
  'import_obj',
  'import_3mf',
];

const BUILTIN_FUNCTIONS = [
  'abs',
  'acos',
  'asin',
  'atan',
  'atan2',
  'ceil',
  'cos',
  'exp',
  'floor',
  'len',
  'log',
  'log10',
  'ln',
  'max',
  'min',
  'norm',
  'pow',
  'round',
  'sign',
  'sin',
  'sqrt',
  'tan',
  'concat',
  'search',
  'lookup',
  'str',
  'chr',
  'ord',
  'version',
  'version_num',
  'rands',
  'is_bool',
  'is_list',
  'is_num',
  'is_string',
  'is_undef',
  'is_vector',
  'cross',
  'vector_angle',
];

const SPECIAL_VARIABLES = [
  '$children',
  '$preview',
  '$fn',
  '$fa',
  '$fs',
  '$t',
  '$vpr',
  '$vpt',
  '$vpd',
  '$vpf',
  '$fov',
  '$near',
  '$far',
  '$camera',
  '$parent_modules',
  '$parent_module',
  '$render',
];

const CONSTANTS = ['PI'];

const OPERATORS = [
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  '&&',
  '||',
  '!',
  '?',
  ':',
];

const BRACKETS: Monaco.languages.LanguageConfiguration['brackets'] = [
  ['{', '}'],
  ['[', ']'],
  ['(', ')'],
];

const AUTO_CLOSING_PAIRS: Monaco.languages.LanguageConfiguration['autoClosingPairs'] = [
  { open: '{', close: '}' },
  { open: '[', close: ']' },
  { open: '(', close: ')' },
  { open: '"', close: '"', notIn: ['string'] },
  { open: "'", close: "'", notIn: ['string'] },
];

const SURROUNDING_PAIRS: Monaco.languages.LanguageConfiguration['surroundingPairs'] = [
  { open: '{', close: '}' },
  { open: '[', close: ']' },
  { open: '(', close: ')' },
  { open: '"', close: '"' },
  { open: "'", close: "'" },
];

const WORD_PATTERN = /#?\$?[A-Za-z_][\w$]*/;

type OpenScadMonarchLanguage = Monaco.languages.IMonarchLanguage & {
  directives: string[];
  literals: string[];
  builtinModules: string[];
  builtinFunctions: string[];
  specialVariables: string[];
  constants: string[];
};

const LANGUAGE_CONFIGURATION: Monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: BRACKETS,
  autoClosingPairs: AUTO_CLOSING_PAIRS,
  surroundingPairs: SURROUNDING_PAIRS,
  wordPattern: WORD_PATTERN,
  indentationRules: {
    increaseIndentPattern: /(^.*\{[^}"']*$)|(^\s*(module|function|if|else|for|each|intersection_for|let|assign)\b(?!.*;).*?$)/,
    decreaseIndentPattern: /^\s*[}\]]/,
  },
  onEnterRules: [
    {
      beforeText: /^\s*\/\*.*$/, // block comment start
      afterText: /^.*\*\//,
      action: { indentAction: Monaco.languages.IndentAction.None, appendText: ' * ' },
    },
    {
      beforeText: /^\s*\/\*[^*]*$/,
      action: { indentAction: Monaco.languages.IndentAction.IndentOutdent, appendText: ' * ' },
    },
    {
      beforeText: /^\s*(?:module|function|if|else|for|each|intersection_for|let|assign).*\{\s*$/, // block start
      action: { indentAction: Monaco.languages.IndentAction.Indent },
    },
    {
      beforeText: /^\s*\*.*$/,
      action: { indentAction: Monaco.languages.IndentAction.None, appendText: '* ' },
    },
  ],
};

const monarchLanguage: OpenScadMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.scad',
  keywords: CONTROL_KEYWORDS,
  directives: DIRECTIVES,
  literals: LITERALS,
  builtinModules: BUILTIN_MODULES,
  builtinFunctions: BUILTIN_FUNCTIONS,
  specialVariables: SPECIAL_VARIABLES,
  constants: CONSTANTS,
  operators: OPERATORS,
  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
  ],
  symbols: /[-=><!~?:&|+*/^%]+/,
  escapes: /\\(?:[btnrf"'\\]|x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{4})/,
  tokenizer: {
    root: [
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@keywords': 'keyword.control.openscad',
          '@directives': 'keyword.directive.openscad',
          '@literals': 'constant.language.openscad',
          '@builtinModules': 'support.module.openscad',
          '@builtinFunctions': 'support.function.openscad',
          '@constants': 'constant.language.openscad',
          '@default': 'identifier',
        },
      }],
      [/\$[a-zA-Z_]\w*/, {
        cases: {
          '@specialVariables': 'variable.predefined.openscad',
          '@default': 'identifier',
        },
      }],
      [/[#%!]/, 'keyword.operator'],
      [/\$\d+/, 'variable.predefined.openscad'],
      { include: '@whitespace' },
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': '',
        },
      }],
      [/0[xX][0-9a-fA-F_]+/, 'number.hex'],
      [/0[bB][0-1_]+/, 'number.binary'],
      [/0[oO]?[0-7_]+/, 'number.octal'],
      [/(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/, 'number'],
      [/"/, { token: 'string.quote', next: '@string' }],
      [/'/, { token: 'string.quote', next: '@char' }],
    ],

    whitespace: [
      [/\s+/, 'white'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      // eslint-disable-next-line no-useless-escape
      [/\/\*/, 'comment', '@push'],
      // eslint-disable-next-line no-useless-escape
      [/\*\//, 'comment', '@pop'],
      [/\/[\/*]/, 'comment'],
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, { token: 'string.quote', next: '@pop' }],
    ],

    char: [
      [/[^\\']+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/'/, { token: 'string.quote', next: '@pop' }],
    ],
  },
};

let registered = false;

export function ensureOpenScadLanguage(monaco: typeof Monaco): void {
  if (registered) return;

  const alreadyRegistered = monaco.languages
    .getLanguages()
    .some(language => language.id === LANGUAGE_ID);

  if (!alreadyRegistered) {
    monaco.languages.register({
      id: LANGUAGE_ID,
      aliases: ['OpenSCAD', 'openscad'],
      extensions: ['.scad'],
    });
  }

  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, LANGUAGE_CONFIGURATION);
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, monarchLanguage);

  registered = true;
}

export const OPENSCAD_LANGUAGE_CONFIGURATION = LANGUAGE_CONFIGURATION;
export const OPENSCAD_MONARCH_LANGUAGE = monarchLanguage;
