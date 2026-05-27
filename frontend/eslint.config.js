// NOTE: ESLint is not currently installed in this project (no eslint
// dep, no `lint` script). This file is the Vite scaffold default and
// documents the intended ruleset for when ESLint gets wired up.
// Plan-016 D-061's test-wallet allow-list lives here as documented
// intent; actual production-safety enforcement comes from three other
// belts:
//   1. Module-eval `if (import.meta.env.PROD) throw` in
//      frontend/src/test-wallet/index.ts (runtime belt).
//   2. Vite static replacement of import.meta.env.VITE_TEST_WALLET +
//      Rollup tree-shake of the dead branch (build-time belt).
//   3. AE4 grep verification: `grep -rE 'TestWalletAdapter|suiprivkey|
//      VITE_TEST_WALLET_KEY|loadKeypair' frontend/dist/` → zero matches
//      (manual verification per plan-016 §U6).

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    // plan-016 D-061 — test-wallet allow-list. Production code paths must
    // not import test-wallet/* directly; only the wrapper hooks under
    // src/wallet/* are permitted to reach in, and they gate their access
    // behind TEST_WALLET_ENABLED so Rollup tree-shakes the import out of
    // production bundles when VITE_TEST_WALLET is unset. AE4 grep on the
    // built bundle verifies zero residual refs.
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/test-wallet', '**/test-wallet/*'],
              message:
                'Importing test-wallet is restricted. Only src/wallet/* and src/test-wallet/* may reach in (plan-016 D-061).',
            },
          ],
        },
      ],
    },
  },
  // The wallet wrappers and the test-wallet module itself ARE the
  // permitted boundary — un-restrict them.
  {
    files: ['src/wallet/**/*.{ts,tsx}', 'src/test-wallet/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
])
