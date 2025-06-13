module.exports = {
    env: {
        browser: true,
        commonjs: true,
        es6: true,
        node: true
    },
    extends: 'eslint:recommended',
    parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'script'
    },
    rules: {
        'indent': ['error', 2],
        'linebreak-style': ['error', 'unix'],
        'quotes': ['error', 'single'],
        'semi': ['error', 'always'],
        'no-unused-vars': ['error', { 'args': 'none' }],
        'no-console': 'off',
        'no-useless-escape': 'off',
        'no-prototype-builtins': 'off',
        'no-control-regex': 'off',
        'no-empty': 'off',
        'no-unsafe-finally': 'off'
    },
    globals: {
        'WebSocket': 'readonly',
        'globalThis': 'readonly'
    }
};