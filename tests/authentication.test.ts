import { describe, expect, it } from 'vitest';
import { resolvePanelAuthentication } from '../src/security/authentication.js';

describe('panel authentication', () => {
  it('enables password protection in auto mode only when a password exists', () => {
    expect(resolvePanelAuthentication('auto', null)).toEqual({ mode: 'none', password: null });
    expect(resolvePanelAuthentication('auto', 'x')).toEqual({ mode: 'password', password: 'x' });
  });

  it('accepts any non-empty password without composition or length rules', () => {
    expect(resolvePanelAuthentication('password', 'x')).toEqual({ mode: 'password', password: 'x' });
  });

  it('supports explicit modes', () => {
    expect(resolvePanelAuthentication('none', 'ignored')).toEqual({ mode: 'none', password: null });
    expect(() => resolvePanelAuthentication('password', null)).toThrow(/requires/i);
  });
});
