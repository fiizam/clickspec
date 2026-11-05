export interface FormatResult {
  code: string;
  isValid: boolean;
  warnings: string[];
}

/**
 * Strips markdown code blocks, normalizes indentation, and ensures
 * valid Playwright test structure. Supports mobile device emulation injection.
 */
export function formatGeneratedTest(
  rawCode: string,
  testTitle = 'generated e2e flow',
  deviceName?: string,
  visual?: boolean,
  storageState?: string
): FormatResult {
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
  code = stripFences(code);

  // Ensure import statement is present
  if (!code.includes('@playwright/test')) {
    warnings.push("Added missing '@playwright/test' import.");
    code = `import { test, expect } from '@playwright/test';\n\n${code}`;
  } else if (!code.includes('import { test') && !code.includes('import {') && !code.includes('import test')) {
    code = `import { test, expect } from '@playwright/test';\n\n${code}`;
  }

  // Handle device emulation for mobile mode
  if (deviceName) {
    if (!/\bdevices\b/.test(code)) {
      code = code.replace(
        /import\s*\{\s*([^}]+)\s*\}\s*from\s*(['"])@playwright\/test\2/,
        (_match, imports, quote) => {
          const cleanImports = imports.trim();
          return `import { ${cleanImports}, devices } from ${quote}@playwright/test${quote}`;
        }
      );
    }

    if (!code.includes('test.use(')) {
      const testIdx = code.search(/\btest(?:\.describe)?\s*\(/);
      const useBlock = `test.use({\n  ...devices['${deviceName}'],\n  defaultBrowserType: 'chromium',\n});\n\n`;
      if (testIdx !== -1) {
        code = code.slice(0, testIdx) + useBlock + code.slice(testIdx);
      } else {
        code = `${useBlock}${code}`;
      }
    } else if (!code.includes('defaultBrowserType')) {
      // Ensure mobile devices like iPhone don't crash expecting uninstalled webkit engine
      code = code.replace(
        /test\.use\(\{\s*([\s\S]*?)\}\);/,
        (_match, inner) => `test.use({\n${inner.trimEnd()},\n  defaultBrowserType: 'chromium',\n});`
      );
    }
  }

  // Handle storageState authentication reuse
  const normStorageState = storageState ? storageState.replace(/\\/g, '/') : undefined;
  if (normStorageState) {
    if (code.includes('test.use(')) {
      if (!code.includes('storageState')) {
        code = code.replace(
          /test\.use\(\{\s*([\s\S]*?)\}\);/,
          (_match, inner) => `test.use({\n${inner.trimEnd()},\n  storageState: '${normStorageState}',\n});`
        );
      }
    } else {
      const testIdx = code.search(/\btest(?:\.describe)?\s*\(/);
      const useBlock = `test.use({\n  storageState: '${normStorageState}',\n});\n\n`;
      if (testIdx !== -1) {
        code = code.slice(0, testIdx) + useBlock + code.slice(testIdx);
      } else {
        code = `${useBlock}${code}`;
      }
    }
  }

  // Handle visual regression testing assertion
  if (visual && !code.includes('toHaveScreenshot')) {
    const gotoMatch = code.match(/(?:await\s+page\.goto\([^)]+\);?|await\s+\w+\.goto\([^)]*\);?)/);
    const visualAssertion = `\n\n  // Verify visual appearance matches baseline\n  await expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.05 });`;
    if (gotoMatch && gotoMatch.index !== undefined) {
      const insertPos = gotoMatch.index + gotoMatch[0].length;
      code = code.slice(0, insertPos) + visualAssertion + code.slice(insertPos);
    } else {
      const lastBraceIdx = code.lastIndexOf('});');
      if (lastBraceIdx !== -1) {
        code = code.slice(0, lastBraceIdx) + visualAssertion + '\n' + code.slice(lastBraceIdx);
      }
    }
  }

  // Ensure test() or test.describe() exists
  if (!code.includes('test(') && !code.includes('test.describe(')) {
    warnings.push('Code was not wrapped in test block; wrapping inside test(...) block.');
    const useProps: string[] = [];
    if (deviceName) {
      useProps.push(`  ...devices['${deviceName}'],\n  defaultBrowserType: 'chromium',`);
    }
    if (normStorageState) {
      useProps.push(`  storageState: '${normStorageState}',`);
    }
    const useSnippet = useProps.length > 0 ? `test.use({\n${useProps.join('\n')}\n});\n\n` : '';
    const visualSnippet = visual ? `\n  await expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.05 });` : '';
    code = `import { test, expect${deviceName ? ', devices' : ''} } from '@playwright/test';\n\n${useSnippet}test('${testTitle.replace(/'/g, "\\'")}', async ({ page }) => {\n${indentCode(code, 2)}${visualSnippet}\n});\n`;
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

function stripFences(code: string): string {
  let c = code.trim();
  if (c.includes('```')) {
    const match = c.match(/```(?:typescript|ts|javascript|js)?\s*([\s\S]*?)```/i);
    if (match && match[1]) {
      c = match[1].trim();
    } else {
      c = c.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
    }
  }
  return c;
}

export interface POMFormatResult {
  pageObjectCode: string;
  specCode: string;
  isValid: boolean;
  warnings: string[];
}

export function formatPOMResult(
  rawOutput: string,
  pageClassName = 'FlowPage',
  relativeImportPath = '../pages/FlowPage.js',
  testTitle = 'generated e2e flow',
  deviceName?: string,
  visual?: boolean,
  storageState?: string
): POMFormatResult {
  const warnings: string[] = [];

  if (!rawOutput || typeof rawOutput !== 'string') {
    return {
      pageObjectCode: '',
      specCode: '',
      isValid: false,
      warnings: ['Received empty output from AI model'],
    };
  }

  let poCode = '';
  let specCode = '';

  const poMatch = rawOutput.match(/<<<PAGE_OBJECT>>>([\s\S]*?)<<<END_PAGE_OBJECT>>>/i);
  const specMatch = rawOutput.match(/<<<SPEC>>>([\s\S]*?)<<<END_SPEC>>>/i);

  if (poMatch && poMatch[1]) {
    poCode = stripFences(poMatch[1]);
  }
  if (specMatch && specMatch[1]) {
    specCode = stripFences(specMatch[1]);
  }

  // Fallback: If tags weren't returned, smartly separate by class & test
  if (!poCode || !specCode) {
    warnings.push('AI response did not strictly follow POM tags; applying heuristic separation.');
    const stripped = stripFences(rawOutput);
    const classIdx = stripped.indexOf('export class ');
    const testIdx = stripped.indexOf('test(');

    if (classIdx !== -1 && testIdx !== -1 && testIdx > classIdx) {
      poCode = stripped.slice(classIdx, testIdx).trim();
      specCode = stripped.slice(testIdx).trim();
    } else {
      poCode = stripped;
      specCode = stripped;
    }
  }

  // Ensure Page Object imports type Page
  if (!poCode.includes('@playwright/test')) {
    poCode = `import type { Page, Locator } from '@playwright/test';\n\n${poCode}`;
  }

  // Ensure Spec file imports test, expect and the Page class
  if (!specCode.includes('@playwright/test')) {
    specCode = `import { test, expect } from '@playwright/test';\n\n${specCode}`;
  }
  const importRegex = new RegExp(`import\\s+.*\\b${pageClassName}\\b.*from`);
  if (!importRegex.test(specCode)) {
    specCode = `import { ${pageClassName} } from '${relativeImportPath}';\n${specCode}`;
  }

  const formattedSpec = formatGeneratedTest(specCode, testTitle, deviceName, visual, storageState);
  warnings.push(...formattedSpec.warnings);

  return {
    pageObjectCode: poCode.replace(/\r\n/g, '\n').trim() + '\n',
    specCode: formattedSpec.code,
    isValid: formattedSpec.isValid && poCode.length > 0,
    warnings,
  };
}

