import { test, expect } from '@playwright/test';

test.describe('WebSocket Real Connection Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
  });

  test('should establish WebSocket connection', async ({ page }) => {
    // Click connect button
    await page.click('#connectBtn');

    // Wait for connection to be established
    await page.waitForSelector('#status.connected', { timeout: 5000 });

    // Verify status text
    const statusText = await page.locator('#statusText').textContent();
    expect(statusText).toBe('Connected');

    // Verify WebSocket readyState is OPEN (1)
    const readyState = await page.evaluate(() => window.testAPI.getConnectionState());
    expect(readyState).toBe(1); // WebSocket.OPEN
  });

  test('should send and receive text messages', async ({ page }) => {
    // Connect
    await page.click('#connectBtn');
    await page.waitForSelector('#status.connected');

    // Send a test message
    await page.fill('#messageInput', 'Hello WebSocket!');
    await page.click('#sendBtn');

    // Wait for message to appear in log
    await page.waitForFunction(() => {
      const logs = window.testAPI.getLogEntries();
      return logs.some(log => log.includes('Received: Hello WebSocket!'));
    }, { timeout: 5000 });

    // Verify both sent and received messages in log
    const logs = await page.evaluate(() => window.testAPI.getLogEntries());
    expect(logs.some(log => log.includes('Sent: Hello WebSocket!'))).toBe(true);
    expect(logs.some(log => log.includes('Received: Hello WebSocket!'))).toBe(true);
  });

  test('should handle ping-pong messages', async ({ page }) => {
    // Connect
    await page.click('#connectBtn');
    await page.waitForSelector('#status.connected');

    // Send ping
    await page.click('#pingBtn');

    // Wait for pong response
    await page.waitForFunction(() => {
      const logs = window.testAPI.getLogEntries();
      return logs.some(log => log.includes('Received: pong'));
    }, { timeout: 5000 });

    const logs = await page.evaluate(() => window.testAPI.getLogEntries());
    expect(logs.some(log => log.includes('Sent: ping'))).toBe(true);
    expect(logs.some(log => log.includes('Received: pong'))).toBe(true);
  });

  test('should send and receive binary data', async ({ page }) => {
    // Connect
    await page.click('#connectBtn');
    await page.waitForSelector('#status.connected');

    // Send binary message
    await page.click('#binaryBtn');

    // Wait for binary response
    await page.waitForFunction(() => {
      const logs = window.testAPI.getLogEntries();
      return logs.some(log => log.includes('Received binary data'));
    }, { timeout: 5000 });

    const logs = await page.evaluate(() => window.testAPI.getLogEntries());
    expect(logs.some(log => log.includes('Sent binary data: 5 bytes'))).toBe(true);
    expect(logs.some(log => log.includes('Received binary data'))).toBe(true);
  });

  test('should handle connection close gracefully', async ({ page }) => {
    // Connect
    await page.click('#connectBtn');
    await page.waitForSelector('#status.connected');

    // Disconnect
    await page.click('#disconnectBtn');

    // Wait for disconnection
    await page.waitForSelector('#status.disconnected', { timeout: 5000 });

    const statusText = await page.locator('#statusText').textContent();
    expect(statusText).toBe('Disconnected');

    // Verify buttons are in correct state
    const connectBtnDisabled = await page.locator('#connectBtn').isDisabled();
    const sendBtnDisabled = await page.locator('#sendBtn').isDisabled();

    expect(connectBtnDisabled).toBe(false);
    expect(sendBtnDisabled).toBe(true);
  });

  test('should update readyState correctly', async ({ page }) => {
    // Initial state
    let readyStateText = await page.locator('#readyStateValue').textContent();
    expect(readyStateText).toBe('-');

    // Connect
    await page.click('#connectBtn');

    // Wait for OPEN state
    await page.waitForFunction(() => {
      const state = window.testAPI.getConnectionState();
      return state === 1; // WebSocket.OPEN
    }, { timeout: 5000 });

    readyStateText = await page.locator('#readyStateValue').textContent();
    expect(readyStateText).toContain('1 (OPEN)');

    // Disconnect
    await page.click('#disconnectBtn');

    // Wait for CLOSED state
    await page.waitForFunction(() => {
      const state = window.testAPI.getConnectionState();
      return state === 3 || state === -1; // WebSocket.CLOSED or null
    }, { timeout: 5000 });
  });

  test('should handle multiple messages in sequence', async ({ page }) => {
    // Connect
    await page.click('#connectBtn');
    await page.waitForSelector('#status.connected');

    // Send multiple messages
    const messages = ['Message 1', 'Message 2', 'Message 3'];

    for (const msg of messages) {
      await page.fill('#messageInput', msg);
      await page.click('#sendBtn');
    }

    // Wait for all responses
    await page.waitForFunction((expectedMsgs) => {
      const logs = window.testAPI.getLogEntries();
      return expectedMsgs.every(msg =>
        logs.some(log => log.includes(`Received: ${msg}`))
      );
    }, messages, { timeout: 10000 });

    const logs = await page.evaluate(() => window.testAPI.getLogEntries());

    // Verify all messages were sent and received
    for (const msg of messages) {
      expect(logs.some(log => log.includes(`Sent: ${msg}`))).toBe(true);
      expect(logs.some(log => log.includes(`Received: ${msg}`))).toBe(true);
    }
  });

  test('should display WebSocket API constants correctly', async ({ page }) => {
    const constants = await page.evaluate(() => {
      return {
        CONNECTING: WebSocket.CONNECTING,
        OPEN: WebSocket.OPEN,
        CLOSING: WebSocket.CLOSING,
        CLOSED: WebSocket.CLOSED
      };
    });

    expect(constants.CONNECTING).toBe(0);
    expect(constants.OPEN).toBe(1);
    expect(constants.CLOSING).toBe(2);
    expect(constants.CLOSED).toBe(3);
  });

  test('should handle Enter key to send message', async ({ page }) => {
    // Connect
    await page.click('#connectBtn');
    await page.waitForSelector('#status.connected');

    // Type message and press Enter
    await page.fill('#messageInput', 'Test Enter Key');
    await page.press('#messageInput', 'Enter');

    // Wait for response
    await page.waitForFunction(() => {
      const logs = window.testAPI.getLogEntries();
      return logs.some(log => log.includes('Received: Test Enter Key'));
    }, { timeout: 5000 });

    const logs = await page.evaluate(() => window.testAPI.getLogEntries());
    expect(logs.some(log => log.includes('Received: Test Enter Key'))).toBe(true);
  });

  test('should clear log when clear button is clicked', async ({ page }) => {
    // Connect to generate some log entries
    await page.click('#connectBtn');
    await page.waitForSelector('#status.connected');

    // Verify log has entries
    let logCount = await page.locator('#log .log-entry').count();
    expect(logCount).toBeGreaterThan(0);

    // Clear log
    await page.click('#clearLogBtn');

    // Verify log is empty
    logCount = await page.locator('#log .log-entry').count();
    expect(logCount).toBe(0);
  });
});
