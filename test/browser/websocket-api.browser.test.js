import { test, expect } from '@playwright/test';

test.describe('Browser WebSocket API', () => {
  test('should have WebSocket API available in browser', async ({ page }) => {
    await page.goto('https://example.com');

    const hasWebSocket = await page.evaluate(() => {
      return typeof WebSocket !== 'undefined';
    });

    expect(hasWebSocket).toBe(true);
  });

  test('should be able to check WebSocket properties', async ({ page }) => {
    await page.goto('https://example.com');

    const wsProperties = await page.evaluate(() => {
      return {
        hasWebSocket: typeof WebSocket !== 'undefined',
        hasConstants: typeof WebSocket.CONNECTING !== 'undefined',
        connectingValue: WebSocket.CONNECTING,
        openValue: WebSocket.OPEN,
        closingValue: WebSocket.CLOSING,
        closedValue: WebSocket.CLOSED
      };
    });

    expect(wsProperties.hasWebSocket).toBe(true);
    expect(wsProperties.hasConstants).toBe(true);
    expect(wsProperties.connectingValue).toBe(0);
    expect(wsProperties.openValue).toBe(1);
    expect(wsProperties.closingValue).toBe(2);
    expect(wsProperties.closedValue).toBe(3);
  });
});
