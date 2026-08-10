import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  // Доступность проверяется линтером, а не ревьюером: перепутанный порядок dt/dd и
  // подпись без lang — ошибки, которые глазами не видно, а правилом видно всегда.
  // Для пакетов без JSX набор молчит: правилам нужен JSX-узел.
  jsxA11y.flatConfigs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)
