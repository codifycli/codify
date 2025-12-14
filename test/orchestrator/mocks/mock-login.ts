import { vi } from 'vitest';

import { LoginHelper } from '../../../src/connect/login-helper.js';

/**
 * Must mock node:fs/promises before calling this function
 */
export async function fakeLogin(): Promise<string> {
  await LoginHelper.load();
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30'
  await LoginHelper.save(token);
  return token;
}

/**
 * Must mock node:fs/promises before calling this function
 */
export async function fakeLogout() {
  await LoginHelper.load();
  await LoginHelper.logout();
}
