import { test, expect } from '@playwright/test';

test('seed new user with supplies and meal plan', async ({ page }) => {
  await page.goto('http://localhost:3000');

  await page.getByPlaceholder('you@example.com').fill('seed@fridge.dev');
  await page.getByRole('button', { name: 'Send magic link' }).click();

  await expect(page.getByText('No supplies stocked.')).toBeVisible({ timeout: 10000 });

  await page.getByRole('link', { name: 'Supplies' }).click();

  await page.getByLabel('Add supplies').fill(
    '500 g chicken breast, 1 kg carrot, 1 kg potatoes, 500 g tomatoes, 600 g cod fish, 200 g onions, broccoli 1 piece, pasta penne 500 g, strawberries 1 kg, bananas 1 kg, apples 1 kg, yogurt 500 g, cottage cheese 300 g, mozarella 200 g'
  );
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Confirm' }).click();

  await expect(page.getByText('14 items in stock')).toBeVisible({ timeout: 10000 });

  await page.getByRole('link', { name: 'Plan' }).click();

  await expect(page.getByRole('button', { name: 'Pick this set' }).first()).toBeVisible({ timeout: 60000 });
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Pick this set' }).first().click();

  await expect(page.getByText("Reset today's plan")).toBeVisible({ timeout: 10000 });
});
