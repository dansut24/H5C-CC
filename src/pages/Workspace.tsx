import { useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { api, navigate, openInBackground, usePath, type Ctx } from '../lib';

type EnvCtx = Extract<Ctx, { kind: 'env' }>;
type Tab = { path: string; pinned?: boolean };
type Ticket = { ref: string; subject: string; status: string; created_at: string };

const SECTIONS: Record<string, string> = { tickets: 'Tickets', assets: 'Assets', contacts: 'Contacts', reports: 'Reports' };
const titleFor = (path: string) => {
  const [a, b] = path.split('/').filter(Boolean);
  return b ? decodeURIComponent(b) : SECTIONS[a] ?? 'Tickets';
};

// Normal click opens in the current tab; ctrl/cmd-click opens a background tab.
export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const click = (e: MouseEvent) => {
    e.preventDefault();
    e.ctrlKey || e.metaKey ? openInBackground(to) : navigate(to);
  };
  return <a href={to} className={className} onClick={click}>{children}</a>;
}

export function Workspace({ ctx }: { ctx: EnvCtx }) {
  const key = `h5c.tabs.${ctx.tenant.slug}.${ctx.env}`;
  const path = usePath();
  const current = path === '/' || path.startsWith('/portal') ? '/tickets' : path;
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  });

  const add = (p: string) => setTabs((t) => (t.some((x) => x.path === p) ? t : [...t, { path: p }]));
  useEffect(() => { add(current); }, [current]);
  useEffect(() => { localStorage.setItem(key, JSON.stringify(tabs)); }, [tabs, key]);
  useEffect(() => {
    const f = (e: Event) => add((e as CustomEvent<string>).detail);
    addEventListener('h5c-open', f);
    return () => removeEventListener('h5c-open', f);
  }, []);

  const ordered = [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
  const close = (p: string) => {
    const i = ordered.findIndex((t) => t.path === p);
    setTabs((t) => t.filter((x) => x.path !== p));
    if (p === current) navigate((ordered[i + 1] ?? ordered[i - 1])?.path ?? '/tickets');
  };
  const togglePin = (p: string) => setTabs((t) => t.map((x) => (x.path === p ? { ...x, pinned: !x.pinned } : x)));

  const [section, ref] = current.split('/').filter(Boolean);
  const nav = Object.entries(SECTIONS);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Hi5Central</div>
        <nav>{nav.map(([k, v]) => (
          <Link key={k} to={'/' + k} className={section === k ? 'on' : ''}>{v}</Link>
        ))}</nav>
        <div className="side-foot"><div>{ctx.tenant.name}</div><div>Version {ctx.version}</div></div>
      </aside>
      <div className="main">
        {ctx.env !== 'prod' && (
          <div className={'envbar ' + ctx.env}>
            {ctx.env === 'test' ? 'Test environment · always on the latest release · safe to experiment' : `UAT environment · version ${ctx.version} · review changes before promoting to production`}
          </div>
        )}
        <div className="tabstrip" role="tablist">
          {ordered.map((t) => (
            <div key={t.path} role="tab" aria-selected={t.path === current} className={'tab' + (t.path === current ? ' on' : '')}
              onDoubleClick={() => togglePin(t.path)} title="Double-click to pin">
              <a href={t.path} onClick={(e) => { e.preventDefault(); navigate(t.path); }}>{t.pinned ? '📌 ' : ''}{titleFor(t.path)}</a>
              {!t.pinned && <button aria-label={`Close ${titleFor(t.path)}`} onClick={() => close(t.path)}>×</button>}
            </div>
          ))}
        </div>
        <main className="page">
          {section === 'tickets' && !ref && <TicketList />}
          {section === 'tickets' && ref && <TicketView ref_={ref} />}
          {section && section !== 'tickets' && (
            <div className="empty"><h2>{SECTIONS[section] ?? 'Not found'}</h2><p className="muted">This section arrives in a later phase.</p></div>
          )}
          {!section && <TicketList />}
        </main>
      </div>
    </div>
  );
}

function TicketList() {
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [subject, setSubject] = useState('');
  const [err, setErr] = useState('');
  const load = () => api<Ticket[]>('/itsm/tickets').then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const t = await api<Ticket>('/itsm/tickets', { method: 'POST', body: JSON.stringify({ subject }) });
      setSubject('');
      navigate('/tickets/' + t.ref);
    } catch (x: any) { setErr(x.message); }
  }
  return (
    <>
      <div className="pagehead"><h2>Tickets</h2>
        <form className="inline" onSubmit={create}>
          <input placeholder="Describe the issue" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <button className="btn" disabled={subject.length < 3}>New ticket</button>
        </form>
      </div>
      {err && <p className="error">{err}</p>}
      {rows && rows.length === 0 && <div className="empty"><p className="muted">No tickets yet. Create one above to get started.</p></div>}
      {rows && rows.length > 0 && (
        <table className="grid">
          <thead><tr><th>Ref</th><th>Subject</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.ref}>
              <td><Link to={'/tickets/' + r.ref}>{r.ref}</Link></td>
              <td>{r.subject}</td><td><span className="pill">{r.status}</span></td>
              <td>{new Date(r.created_at).toLocaleString()}</td>
            </tr>))}
          </tbody>
        </table>
      )}
      <p className="muted hint">Tip: ctrl/cmd-click a ticket to open it in a background tab.</p>
    </>
  );
}

function TicketView({ ref_ }: { ref_: string }) {
  const [t, setT] = useState<Ticket | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { setT(null); api<Ticket>('/itsm/tickets/' + ref_).then(setT).catch((e) => setErr(e.message)); }, [ref_]);
  if (err) return <p className="error">{err}</p>;
  if (!t) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="pagehead"><h2>{t.ref}</h2><span className="pill">{t.status}</span></div>
      <div className="card"><h3>{t.subject}</h3><p className="muted">Opened {new Date(t.created_at).toLocaleString()}</p></div>
    </>
  );
}
