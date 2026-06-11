import { test, expect } from '@playwright/test';

// Risk: #7 — Auth session expires or magic-link token is reused, leaving the user locked out with no clear recovery path.
// Seed: tests/seed.spec.ts

test('expired magic link shows error and recovery path', async ({ page }) => {
  // Navigate to verify endpoint with a bogus token — simulates expired/reused link
  await page.goto('http://localhost:3000/api/auth/verify?token=nonexistent-bogus-token');

  // Expect redirect to login with error=expired
  await expect(page).toHaveURL(/\/login\?error=expired/);

  // Assert the expired-link error message is visible
  await expect(page.getByText('Link expired, please request a new one.')).toBeVisible();

  // Assert recovery path: email input and submit button are present and functional
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send magic link' })).toBeVisible();
});
