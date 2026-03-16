import 'monaco-editor/min/vs/editor/editor.main.css'
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/language/css/monaco.contribution'
import 'monaco-editor/esm/vs/language/html/monaco.contribution'
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'
import 'monaco-editor/esm/vs/basic-languages/bat/bat.contribution'
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution'
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution'
import 'monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution'
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution'
import 'monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution'
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'
import 'monaco-editor/esm/vs/basic-languages/swift/swift.contribution'
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'

type MonacoModule = typeof monaco

const LANGUAGE_ALIAS_MAP: Record<string, string> = {
  TypeScript: 'typescript',
  JavaScript: 'javascript',
  Vue: 'html',
  Python: 'python',
  Java: 'java',
  Go: 'go',
  Rust: 'rust',
  C: 'c',
  'C++': 'cpp',
  'C#': 'csharp',
  Ruby: 'ruby',
  PHP: 'php',
  Swift: 'swift',
  Kotlin: 'kotlin',
  HTML: 'html',
  CSS: 'css',
  SCSS: 'scss',
  Less: 'less',
  JSON: 'json',
  YAML: 'yaml',
  TOML: 'ini',
  XML: 'xml',
  Markdown: 'markdown',
  SQL: 'sql',
  Shell: 'shell',
  PowerShell: 'powershell',
  Batch: 'bat',
  Docker: 'dockerfile',
}

const PATH_LANGUAGE_MAP: Array<{ pattern: RegExp; language: string }> = [
  { pattern: /\.tsx?$/i, language: 'typescript' },
  { pattern: /\.jsx?$/i, language: 'javascript' },
  { pattern: /\.vue$/i, language: 'html' },
  { pattern: /\.py$/i, language: 'python' },
  { pattern: /\.java$/i, language: 'java' },
  { pattern: /\.go$/i, language: 'go' },
  { pattern: /\.rs$/i, language: 'rust' },
  { pattern: /\.c$/i, language: 'c' },
  { pattern: /\.(cpp|cc|cxx|hpp|hh|hxx)$/i, language: 'cpp' },
  { pattern: /\.cs$/i, language: 'csharp' },
  { pattern: /\.rb$/i, language: 'ruby' },
  { pattern: /\.php$/i, language: 'php' },
  { pattern: /\.swift$/i, language: 'swift' },
  { pattern: /\.kt$/i, language: 'kotlin' },
  { pattern: /\.html?$/i, language: 'html' },
  { pattern: /\.css$/i, language: 'css' },
  { pattern: /\.scss$/i, language: 'scss' },
  { pattern: /\.less$/i, language: 'less' },
  { pattern: /\.json$/i, language: 'json' },
  { pattern: /\.(yaml|yml)$/i, language: 'yaml' },
  { pattern: /\.toml$/i, language: 'ini' },
  { pattern: /\.xml$/i, language: 'xml' },
  { pattern: /\.md$/i, language: 'markdown' },
  { pattern: /\.sql$/i, language: 'sql' },
  { pattern: /\.(sh|bash|zsh)$/i, language: 'shell' },
  { pattern: /\.ps1$/i, language: 'powershell' },
  { pattern: /\.(bat|cmd)$/i, language: 'bat' },
]

let monacoPromise: Promise<MonacoModule> | null = null
let monacoEnvironmentReady = false
let themeDefined = false

function ensureMonacoEnvironment() {
  if (monacoEnvironmentReady) {
    return
  }

  monacoEnvironmentReady = true
  ;(globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: (_workerId: string, label: string) => Worker }
  }).MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'json') {
        return new jsonWorker()
      }

      if (label === 'css' || label === 'scss' || label === 'less') {
        return new cssWorker()
      }

      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new htmlWorker()
      }

      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker()
      }

      return new editorWorker()
    },
  }
}

function ensureTheme(monaco: MonacoModule) {
  if (themeDefined) {
    return
  }

  themeDefined = true
  monaco.editor.defineTheme('openagent-workbench', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'AF00DB' },
      { token: 'string', foreground: 'A31515' },
      { token: 'number', foreground: '098658' },
      { token: 'type.identifier', foreground: '267F99' },
      { token: 'delimiter.bracket', foreground: '4B5563' },
    ],
    colors: {
      'editor.background': '#FCFCFC',
      'editor.foreground': '#1F2937',
      'editorLineNumber.foreground': '#9AA4B2',
      'editorLineNumber.activeForeground': '#2563EB',
      'editorLineNumber.dimmedForeground': '#D3DAE4',
      'editor.selectionBackground': '#ADD6FF80',
      'editor.inactiveSelectionBackground': '#D7EAFE80',
      'editor.lineHighlightBackground': '#F3F6FA',
      'editorCursor.foreground': '#2563EB',
      'editorIndentGuide.background1': '#E5E7EB',
      'editorIndentGuide.activeBackground1': '#93C5FD',
      'editorBracketMatch.background': '#DBEAFE80',
      'editorBracketMatch.border': '#60A5FA',
      'editorGutter.background': '#F7F9FB',
      'editor.findMatchBackground': '#FFF59D',
      'editor.findMatchHighlightBackground': '#FDE68A66',
      'editor.wordHighlightBackground': '#E0F2FE66',
      'editor.wordHighlightStrongBackground': '#BAE6FD77',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.selectedBackground': '#eff6ff',
      'editorHoverWidget.background': '#ffffff',
      'scrollbarSlider.background': '#CBD5E166',
      'scrollbarSlider.hoverBackground': '#94A3B888',
      'scrollbarSlider.activeBackground': '#64748BAA',
      'minimap.background': '#FCFCFC',
    },
  })
}

export async function loadIdeMonaco() {
  ensureMonacoEnvironment()
  monacoPromise ??= Promise.resolve().then(() => {
    ensureTheme(monaco)
    monaco.editor.setTheme('openagent-workbench')
    return monaco
  })

  return monacoPromise
}

export function resolveMonacoLanguage(language?: string, filePath = '') {
  const aliased = language ? LANGUAGE_ALIAS_MAP[language] : ''
  if (aliased) {
    return aliased
  }

  const normalizedPath = filePath.toLowerCase()
  if (normalizedPath.endsWith('/dockerfile') || normalizedPath === 'dockerfile') {
    return 'dockerfile'
  }

  for (const rule of PATH_LANGUAGE_MAP) {
    if (rule.pattern.test(filePath)) {
      return rule.language
    }
  }

  if (normalizedPath.endsWith('.env') || normalizedPath.endsWith('.env.example')) {
    return 'ini'
  }

  return 'plaintext'
}

export function formatMonacoLanguageLabel(language: string) {
  const labels: Record<string, string> = {
    plaintext: 'Plain Text',
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    html: 'HTML',
    python: 'Python',
    java: 'Java',
    go: 'Go',
    rust: 'Rust',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    ruby: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    kotlin: 'Kotlin',
    css: 'CSS',
    scss: 'SCSS',
    less: 'Less',
    json: 'JSON',
    yaml: 'YAML',
    ini: 'INI / TOML',
    xml: 'XML',
    markdown: 'Markdown',
    sql: 'SQL',
    shell: 'Shell',
    powershell: 'PowerShell',
    bat: 'Batch',
    dockerfile: 'Dockerfile',
  }

  return labels[language] || language
}
