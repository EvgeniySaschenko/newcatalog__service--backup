module.exports = {
  root: true,
  env: {
    node: true,
    es6: true,
  },
  extends: ['eslint:recommended', 'plugin:prettier/recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2022,
  },
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'prefer-const': 'off',
    'no-var': 'error',
    'no-unused-vars': 'warn',
    'unicorn/error-message': 'off',
    eqeqeq: 'warn',
    'no-empty-function': 'off',
    'function-paren-newline': ['error', 'multiline-arguments'],
  },
  overrides: [
    {
      files: ['**/__tests__/*.{j,t}s?(x)', '**/tests/unit/**/*.spec.{j,t}s?(x)'],
      env: {
        jest: true,
      },
    },
  ],
};
