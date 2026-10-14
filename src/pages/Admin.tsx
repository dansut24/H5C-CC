import { useEffect, useState } from 'react';
import { api } from '../lib';

type Overview = {
  tenant: { name: string; slug: string; updateModel: string | null; region: string; maintenanceDay: number; maintenanceHour: number };
  environments: { kind: string; version: string; status: string; url: string; updated_at: string }[];
};
const NAMES: Record<string, string> = { prod: 'Production', uat: 'UAT', test: 'Test', rmm: 'RMM' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Admin({ ctx }: { ctx: { tenant: { name: string } } }) {
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<Overview>('/admin/overview').then(setO).catch((e) => setErr(e.message)); }, []);
  return (
    <div className="admin">
      <header><h1>{ctx.tenant.name}</h1><span className="muted">Admin Portal</span></header>
      {err && <p className="error">{err}</p>}
      {o && <>
        <section className="card">
          <h2>Environments</h2>
          <table>
            <thead><tr><th>Environment</th><th>Address</th><th>Version</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>{o.environments.map((e) => (
              <tr key={e.kind}>
                <td>{NAMES[e.kind]}</td>
                <td><a href={e.url}>{e.url.replace('https://', '')}</a></td>
                <td>{e.version}</td>
                <td><span className={'pill ' + e.status}>{e.status}</span></td>
                <td>{new Date(e.updated_at).toLocaleDateString()}</td>
              </tr>))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Updates</h2>
          <p>Model: <b>{o.tenant.updateModel ?? 'Not applicable (RMM only)'}</b></p>
          {o.tenant.updateModel === 'managed' && <p>Maintenance window: {DAYS[o.tenant.maintenanceDay]} from {String(o.tenant.maintenanceHour).padStart(2, '0')}:00</p>}
          <p className="muted">Region: {o.tenant.region.toUpperCase()}. Billing, access and promotion arrive in the next phases.</p>
        </section>
      </>}
    </div>
  );
}
