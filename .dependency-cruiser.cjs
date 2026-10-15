// Import rules from AGENTS.md. `npm run deps` checks them; `npm run check` runs it too.
const { readdirSync } = require('node:fs')

// The other features each feature may import. Anything else under src/features/<name>/ is private to <name>.
// A new edge couples two features that agents may be changing in parallel: add it here on purpose, not to get past CI.
const FEATURE_DEPS = {
  changes: ['review'],
  chat: ['review'],
  files: ['review'],
  'git-graph': ['changes'],
  palette: ['chat'],
  settings: ['hosts'],
  sidebar: ['hosts'],
  // The layout that puts the views into tabs and the side panel.
  tabs: ['changes', 'files', 'git-graph', 'review', 'terminal'],
}

const features = readdirSync(`${__dirname}/src/features`)

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...features.map((name) => ({
      name: `feature-deps-${name}`,
      comment: `features/${name} imports another feature it doesn't declare in FEATURE_DEPS (.dependency-cruiser.cjs).`,
      severity: 'error',
      from: { path: `^src/features/${name}/` },
      to: { path: '^src/features/', pathNot: `^src/features/(${[name, ...(FEATURE_DEPS[name] ?? [])].join('|')})/` },
    })),
    {
      name: 'shared-not-to-features',
      comment: 'Shared modules (src/*.ts, src/components/) sit below the features: only App.tsx composes features.',
      severity: 'error',
      from: { path: '^src/(components/|[^/]+$)', pathNot: '^src/App\\.tsx$' },
      to: { path: '^src/features/' },
    },
    {
      name: 'css-only-via-index',
      comment: 'Our stylesheets load only through @import in src/index.css, which fixes the cascade order; a component import would reorder it. A package\'s own CSS (xterm) may load from its component.',
      severity: 'error',
      from: { pathNot: '^src/main\\.tsx$' },
      to: { path: '^src/.+\\.css$' },
    },
    {
      name: 'no-node-in-browser',
      comment: 'src/ runs in the browser; code that needs Node belongs in paseo-plugin/ (tests run in Node and may).',
      severity: 'error',
      from: { path: '^src/', pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'plugin-apart',
      comment: 'paseo-plugin/ runs in the daemon and installs on its own: no imports between it and src/ (src/git.ts mirrors its types).',
      severity: 'error',
      from: { path: '^(src|paseo-plugin)/' },
      to: { path: '^(src|paseo-plugin)/', pathNot: '^$1/' },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules'] },
    // Type-only imports couple features too.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.app.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.d.ts'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    skipAnalysisNotInRules: true,
  },
}
