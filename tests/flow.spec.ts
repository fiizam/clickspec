import { test, expect } from '@playwright/test';

test('Navigate from Example Domain to IANA example domains information page', async ({ page }) => {
  // Navigate to initial target URL
  await page.goto('https://example.com/');

  // Verify initial landing page state
  await expect(page).toHaveURL('https://example.com/');
  await expect(page.getByText('This domain is for use in documentation examples')).toBeVisible();

  // Click "Learn more" link
  const learnMoreLink = page.getByRole('link', { name: 'Learn more' });
  await expect(learnMoreLink).toBeVisible();
  await learnMoreLink.click();

  // Verify navigation to the IANA documentation page
  await expect(page).toHaveURL(/.*iana\.org\/help\/example-domains/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
