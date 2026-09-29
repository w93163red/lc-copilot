export const LANGS = {
  'C++': 'cpp',
  Java: 'java',
  Python3: 'python3',
  Python: 'python',
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  'C#': 'csharp',
  C: 'c',
  Go: 'golang',
  Kotlin: 'kotlin',
  Swift: 'swift',
  Rust: 'rust',
  Ruby: 'ruby',
  PHP: 'php',
  Dart: 'dart',
  Scala: 'scala',
  Elixir: 'elixir',
  Erlang: 'erlang',
  Racket: 'racket',
};

export function detectLang(buttonTexts) {
  for (const text of buttonTexts) {
    const name = text.trim();
    if (Object.hasOwn(LANGS, name)) return name;
  }
  return 'Python3';
}
