import type { RepoMeterConfig } from "./types.js";

export const DEFAULT_CONFIG: RepoMeterConfig = {
  include: [],
  exclude: [
    "**/node_modules/**",
    "**/.git/**",
    "**/.next/**",
    "**/.open-next/**",
    "**/dist/**",
    "**/build/**",
    "**/.tmp/**",
    "**/coverage/**",
    "**/.turbo/**",
    "**/.cache/**",
    "**/vendor/scc/**"
  ],
  generated: [
    "**/*.generated.*",
    "**/*.gen.*",
    "**/*.min.*",
    "**/generated/**",
    "**/__snapshots__/**",
    "**/*.snap"
  ],
  categories: {
    tests: {
      include: [
        "**/test/**",
        "**/tests/**",
        "**/__tests__/**",
        "**/*.test.*",
        "**/*.spec.*",
        "**/fixtures/**"
      ]
    },
    docs: {
      include: ["**/*.md", "**/*.mdx", "**/docs/**", "**/documentation/**"]
    },
    config: {
      include: [
        "**/.github/**",
        "**/*config.*",
        "**/*rc",
        "**/*rc.*",
        "**/package.json",
        "**/tsconfig*.json",
        "**/eslint*.{js,cjs,mjs,json,yml,yaml}",
        "**/prettier*.{js,cjs,mjs,json,yml,yaml}",
        "**/vite.config.*",
        "**/vitest.config.*",
        "**/webpack.config.*",
        "**/rollup.config.*"
      ]
    },
    migrations: {
      include: ["**/migrations/**", "**/migration/**", "**/*.sql"]
    },
    lockfiles: {
      include: [
        "**/package-lock.json",
        "**/pnpm-lock.yaml",
        "**/yarn.lock",
        "**/bun.lockb",
        "**/Cargo.lock",
        "**/Gemfile.lock",
        "**/poetry.lock"
      ]
    },
    assets: {
      include: [
        "**/*.{png,jpg,jpeg,gif,webp,svg,ico,pdf,mp3,mp4,woff,woff2,ttf,eot,zip,gz,tar,exe,dll,bin}"
      ]
    }
  },
  largeFileWarning: 800,
  topFiles: 5,
  baselineDir: ".repo-meter/baselines",
  watchIntervalMs: 3000,
  repos: [],
  tui: {
    intervalMs: 2000,
    remote: false
  }
};

export const TEXT_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".md",
  ".mdx",
  ".txt",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".xml",
  ".svg",
  ".sql",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".py",
  ".rb",
  ".php",
  ".cs",
  ".swift",
  ".sh",
  ".ps1",
  ".bat",
  ".env",
  ".gitignore",
  ".npmignore",
  ".editorconfig",
  ".lock",
  ".properties"
]);

export const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TSX",
  ".js": "JavaScript",
  ".jsx": "JSX",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".json": "JSON",
  ".jsonc": "JSON",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".toml": "TOML",
  ".ini": "INI",
  ".cfg": "Config",
  ".conf": "Config",
  ".md": "Markdown",
  ".mdx": "MDX",
  ".txt": "Text",
  ".css": "CSS",
  ".scss": "SCSS",
  ".sass": "Sass",
  ".less": "Less",
  ".html": "HTML",
  ".xml": "XML",
  ".svg": "SVG",
  ".sql": "SQL",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".py": "Python",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".swift": "Swift",
  ".sh": "Shell",
  ".ps1": "PowerShell",
  ".bat": "Batch",
  ".lock": "Lockfile"
};
