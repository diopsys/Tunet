import { test, expect } from './fixtures';

test('keeps a bookmarked page instead of the page saved on the device', async ({
  page,
  mockHAConnection,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('ha_url', 'http://localhost:8123');
    localStorage.setItem('ha_auth_method', 'token');
    localStorage.setItem('ha_token', 'test_token');
    localStorage.setItem('tunet_active_page', 'home');
    localStorage.setItem(
      'tunet_pages_config',
      JSON.stringify({
        header: [],
        pages: ['home', 'energy'],
        home: [],
        energy: [],
      })
    );
  });
  await page.goto('/#/page/energy');
  await expect(page.getByTestId('settings-dropdown-trigger')).toBeVisible();
  await expect(page).toHaveURL(/#\/page\/energy$/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('tunet_active_page')))
    .toBe('energy');
});
