import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAccounts } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAccounts', () => {
  it('devuelve la lista cuando la respuesta es correcta', async () => {
    const accounts = [{ id: 'cash1', name: 'Cuenta 1' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => accounts }));

    await expect(fetchAccounts()).resolves.toEqual(accounts);
  });

  it('rechaza si el servidor responde con error para que la UI muestre el fallo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'x' }) }));

    await expect(fetchAccounts()).rejects.toThrow('500');
  });
});
