export interface FormatResult {
  code: string;
  isValid: boolean;
  warnings: string[];
}

/**
 * Strips markdown code blocks, normalizes indentation, and ensures
 * valid Playwright test structure.
 */
export function formatGeneratedTest(rawCode: string, testTitle = 'generated e2e flow'): FormatResult {
  const warnings: string[] = [];

  if (!rawCode || typeof rawCode !== 'string') {
    return {
      code: '',
      isValid: false,
      warnings: ['Received empty or invalid code from AI'],
    };
  }

  let code = rawCode.trim();

  // Strip markdown code fences if present (e.g., ```typescript ... ``` or ```ts ... ```)
  if (code.includes('```')) {
    // Match any ```lang ... ```
    const match = code.match(/```(?:typescript|ts|javascript|js)?\s*([\s\S]*?)```/i);
    if (match && match[1]) {
      code = match[1].trim();
    } else {
      // Fallback: strip leading and trailing backticks
      code = code.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
    }
  }

  // Ensure import statement is present
  if (!code.includes('@playwright/test')) {
    warnings.push("Added missing '@playwright/test' import.");
    code = `import { test, expect } from '@playwright/test';\n\n${code}`;
  } else if (!code.includes('import { test') && !code.includes('import {') && !code.includes('import test')) {
    code = `import { test, expect } from '@playwright/test';\n\n${code}`;
  }

  // Ensure test() or test.describe() exists
  if (!code.includes('test(') && !code.includes('test.describe(')) {
    warnings.push('Code was not wrapped in test block; wrapping inside test(...) block.');
    code = `import { test, expect } from '@playwright/test';

test('${testTitle.replace(/'/g, "\\'")}', async ({ page }) => {
${indentCode(code, 2)}
});
`;
  }

  // Basic syntax balance verification
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;

  if (openBraces !== closeBraces) {
    warnings.push(`Brace imbalance detected (${openBraces} '{' vs ${closeBraces} '}').`);
  }
  if (openParens !== closeParens) {
    warnings.push(`Parentheses imbalance detected (${openParens} '(' vs ${closeParens} ')').`);
  }

  // Normalize line endings to LF
  code = code.replace(/\r\n/g, '\n').trim() + '\n';

  return {
    code,
    isValid: openBraces === closeBraces && openParens === closeParens,
    warnings,
  };
}

function indentCode(source: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return source
    .split('\n')
    .map(line => (line.trim().length > 0 ? `${pad}${line}` : line))
    .join('\n');
}

