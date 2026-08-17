import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';

import { sharedIgnores } from './base.js';

// This package contains only plain JavaScript, so the type-aware rules from
// ./base.js (which require a tsconfig.json) do not apply to it.
export default [{ ignores: sharedIgnores }, js.configs.recommended, prettierConfig];
