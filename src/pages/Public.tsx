import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib';

export function Signup() {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [itsm, setItsm] = useState(true);
  const [rmm, setRmm] = useState(false);
  const [st, setSt] = useState<{ busy?: boolean; sent?: boolean; link?: string; error?: string }>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const products = [itsm && 'itsm', rmm && 'rmm'].filter(Boolean);
    if (!products.length) return setSt({ error: 'Choose at least one product.' });
    setSt({ busy: true });
    try {
      const r = await api<{ devLink?: string }>('/signup', { method: 'POST', body: JSON.stringify({ email, company, products }) });
      setSt({ sent: true, link: r.devLink });
    } catch (x: any) { setSt({ error: x.message }); }
  }

  if (st.sent) return (
    <div className="center"><div className="card narrow">
      <h1>Check your email</h1>
      <p className="muted">We sent a setup link to {email}. It works once and expires in 24 hours.</p>
      {st.link && <p><a className="btn" href={st.link}>Open setup link (test mode)</a></p>}
    </div></div>
  );
  return (
    <div className="center"><form className="card narrow" onSubmit={submit}>
      <h1>Create your Hi5Central account</h1>
      <label>Work email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Company name<input required minLength={2} value={company} onChange={(e) => setCompany(e.target.value)} /></label>
      <fieldset><legend>Products</legend>
        <label className="check"><input type="checkbox" checked={itsm} onChange={(e) => setItsm(e.target.checked)} /> ITSM and customer portal</label>
        <label className="check"><input type="checkbox" checked={rmm} onChange={(e) => setRmm(e.target.checked)} /> RMM</label>
      </fieldset>
      {st.error && <p className="error">{st.error}</p>}
      <button className="btn" disabled={st.busy}>{st.busy ? 'Sending…' : 'Send setup link'}</button>
    </form></div>
  );
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Wizard({ base }: { base: string }) {
  const token = new URLSearchParams(location.search).get('token') || '';
  const [info, setInfo] = useState<{ email: string; company: string; products: string[] } | null>(null);
  const [fatal, setFatal] = useState('');
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ slug: '', name: '', region: 'uk', updateModel: 'managed', maintenanceDay: 0, maintenanceHour: 2, adminName: '' });
  const [slugMsg, setSlugMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ ok: boolean; urls: { label: string; url: string }[] } | null>(null);

  useEffect(() => {
    api<typeof info>(`/onboarding/${token}`).then((i) => { setInfo(i); i && setF((x) => ({ ...x, name: i.company })); }).catch((e) => setFatal(e.message));
  }, [token]);

  const hasItsm = !!info?.products.includes('itsm');
  const steps = ['Company', ...(hasItsm ? ['Updates'] : []), 'Admin', 'Review'];
  const label = steps[step];
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));

  async function checkSlug() {
    const r = await api<{ available: boolean; reason: string | null }>(`/slug/check?slug=${encodeURIComponent(f.slug)}`);
    setSlugMsg(r.available ? null : r.reason);
    return r.available;
  }
  async function next() {
    setError('');
    if (label === 'Company' && !(await checkSlug())) return;
    setStep(step + 1);
  }
  async function create() {
    setBusy(true); setError('');
    try {
      setDone(await api(`/onboarding/${token}`, { method: 'POST', body: JSON.stringify({ ...f, updateModel: hasItsm ? f.updateModel : undefined }) }));
    } catch (x: any) { setError(x.message); }
    setBusy(false);
  }

  if (fatal) return <div className="center"><div className="card narrow"><h1>Link not valid</h1><p className="error">{fatal}</p></div></div>;
  if (!info) return <div className="center muted">Loading…</div>;
  if (done) return (
    <div className="center"><div className="card narrow">
      <h1>{done.ok ? 'Your environments are ready' : 'Setup is still finishing'}</h1>
      {!done.ok && <p className="muted">One step failed and will retry automatically. Check back in a few minutes.</p>}
      <ul className="urls">{done.urls.map((u) => <li key={u.label}><span>{u.label}</span><a href={u.url}>{u.url.replace('https://', '')}</a></li>)}</ul>
    </div></div>
  );

  return (
    <div className="center"><div className="card narrow">
      <p className="muted">Step {step + 1} of {steps.length}: {label}</p>
      {label === 'Company' && <>
        <h1>Your company</h1>
        <label>Company name<input value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Web address
          <input value={f.slug} onChange={(e) => { set('slug', e.target.value.toLowerCase()); setSlugMsg(null); }} onBlur={() => f.slug && checkSlug()} placeholder="acme" />
        </label>
        <p className={slugMsg ? 'error' : 'muted'}>{slugMsg || `${f.slug || 'yourname'}.${base}`}</p>
        <label>Data region<select value={f.region} onChange={(e) => set('region', e.target.value)}>
          <option value="uk">United Kingdom</option><option value="eu">European Union</option><option value="us">United States</option>
        </select></label>
      </>}
      {label === 'Updates' && <>
        <h1>How do you want to receive updates?</h1>
        <label className={'choice' + (f.updateModel === 'managed' ? ' on' : '')}>
          <input type="radio" name="um" checked={f.updateModel === 'managed'} onChange={() => set('updateModel', 'managed')} />
          <span><b>Managed</b>You always get the latest release, applied in your maintenance window.</span>
        </label>
        <label className={'choice' + (f.updateModel === 'custom' ? ' on' : '')}>
          <input type="radio" name="um" checked={f.updateModel === 'custom'} onChange={() => set('updateModel', 'custom')} />
          <span><b>Custom</b>You get a UAT environment, review each change, then promote to production when you choose.</span>
        </label>
        <p className="muted">Every account also gets a Test environment on the latest release.</p>
        {f.updateModel === 'managed' && <div className="row">
          <label>Maintenance day<select value={f.maintenanceDay} onChange={(e) => set('maintenanceDay', +e.target.value)}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
          <label>Start hour<select value={f.maintenanceHour} onChange={(e) => set('maintenanceHour', +e.target.value)}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>
        </div>}
      </>}
      {label === 'Admin' && <>
        <h1>Administrator</h1>
        <label>Your name<input value={f.adminName} onChange={(e) => set('adminName', e.target.value)} /></label>
        <p className="muted">Signing in as {info.email}</p>
      </>}
      {label === 'Review' && <>
        <h1>Review and create</h1>
        <ul className="urls">
          <li><span>Company</span><b>{f.name}</b></li>
          <li><span>Address</span><b>{f.slug}.{base}</b></li>
          {hasItsm && <li><span>Updates</span><b>{f.updateModel === 'managed' ? 'Managed' : 'Custom (with UAT)'}</b></li>}
          <li><span>Products</span><b>{info.products.map((p) => p.toUpperCase()).join(' + ')}</b></li>
        </ul>
      </>}
      {error && <p className="error">{error}</p>}
      <div className="row">
        {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>}
        {label !== 'Review'
          ? <button className="btn" disabled={label === 'Company' ? !f.slug || !f.name : label === 'Admin' ? f.adminName.length < 2 : false} onClick={next}>Continue</button>
          : <button className="btn" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create environments'}</button>}
      </div>
    </div></div>
  );
}
