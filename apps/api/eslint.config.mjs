import config from '@ravonroad/eslint-config'

export default [
  ...config,
  {
    rules: {
      // NestJS собирает DI-токены из emitDecoratorMetadata: `import type` стирает тип
      // параметра конструктора, и провайдер перестаёт резолвиться в рантайме. Правило
      // видит такой импорт как «только тип» и предлагает ровно ту правку, которая ломает
      // приложение, — поэтому в api оно выключено, а не глушится в каждом сервисе.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
]
