export type PanelAuthenticationMode = 'auto' | 'password' | 'none';
export type EffectivePanelAuthentication = 'password' | 'none';

export interface PanelAuthentication {
  mode: EffectivePanelAuthentication;
  password: string | null;
}

export function resolvePanelAuthentication(mode: PanelAuthenticationMode, password: string | null): PanelAuthentication {
  if (mode === 'none') return { mode: 'none', password: null };
  if (mode === 'password') {
    if (!password) throw new Error('server.authentication=password requires ORCHESTRATOR_ADMIN_PASSWORD or its _FILE variant');
    return { mode: 'password', password };
  }
  return password ? { mode: 'password', password } : { mode: 'none', password: null };
}
