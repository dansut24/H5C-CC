import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, type Ctx } from './lib';
import { Signup, Wizard } from './pages/Public';
import { Admin } from './pages/Admin';
import { Workspace } from './pages/Workspace';
import './styles.css';

function App() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<Ctx>('/context').then(setCtx).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="center"><p className="error">{err}</p></div>;
  if (!ctx) return <div className="center muted">Loading…</div>;

  if (ctx.kind === 'marketing') {
    return location.pathname.startsWith('/onboarding') ? <Wizard base={ctx.base} /> : <Signup />;
  }
  if (ctx.kind === 'admin') return <Admin ctx={ctx} />;
  if (ctx.kind === 'env' && ctx.env === 'rmm') {
    return <div className="center"><h1>RMM</h1><p className="muted">{ctx.tenant.name} · version {ctx.version}. Device management arrives in a later phase.</p></div>;
  }
  if (ctx.kind === 'env') return <Workspace ctx={ctx} />;
  return <div className="center"><h1>Environment not found</h1><p className="muted">Check the address, or contact your administrator.</p></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
