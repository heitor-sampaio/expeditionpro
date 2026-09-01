import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Regras inegociáveis do projeto viram lint — princípio sem trava não sobrevive ao
 * terceiro sprint (§10). Além do recomendado do TypeScript:
 *
 *   · $queryRawUnsafe / $executeRawUnsafe proibidos (A03 · §11.8)
 *   · herança proibida, exceto de tipos de erro (composição e função, §10.2)
 *   · fronteira de camadas: domínio não importa aplicação/infra/plataforma
 *
 * O marcador de pendência (em caixa alta) é banido pelo script check:markers, não
 * aqui: em prosa portuguesa "todo" é palavra comum e daria falso-positivo em toda
 * linha de comentário.
 */

const noUnsafeRaw = {
  selector: 'MemberExpression[property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]',
  message: '$queryRawUnsafe/$executeRawUnsafe são proibidos (A03). Use consulta parametrizada.',
};

const noInheritance = {
  selector: 'ClassDeclaration[superClass][superClass.name!=/Error$/]',
  message: 'Sem herança (§10.2). Componha com função. Exceção: tipos de erro (…Error).',
};

const noInheritanceExpr = {
  selector: 'ClassExpression[superClass][superClass.name!=/Error$/]',
  message: 'Sem herança (§10.2). Componha com função. Exceção: tipos de erro (…Error).',
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'packages/infrastructure/src/generated/**',
      'apps/web/dist/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-syntax': ['error', noUnsafeRaw, noInheritance, noInheritanceExpr],
      '@typescript-eslint/no-floating-promises': 'off', // liga quando o lint for type-checked
      '@typescript-eslint/consistent-type-imports': 'error',
      // Convenção: argumento/variável prefixado com _ é intencionalmente não usado.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Scripts e arquivos de config em JS rodam no Node.
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  // Fronteira: o domínio é puro. Não conhece aplicação, infra nem plataforma.
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@expedition/application',
            '@expedition/infrastructure',
            '@prisma/*',
            'prisma',
            'react',
            'react-dom',
            'fastify',
            '@fastify/*',
          ],
        },
      ],
    },
  },
  // A aplicação define ports; não conhece Prisma nem React.
  {
    files: ['packages/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@expedition/infrastructure',
            '@prisma/*',
            'prisma',
            'react',
            'react-dom',
            'fastify',
            '@fastify/*',
          ],
        },
      ],
    },
  },
  // Testes podem usar utilidades de teste livremente.
  {
    files: ['**/*.test.ts', '**/testkit/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
