import { useState } from 'react';
import { PROGRAM_DETAILS, ROI_DEFAULT_VENDOR_PRESETS } from '../../data/vendors';
import { fmtDollar } from '../../lib/vendorHelpers';
import type { useVendorsState } from '../../hooks/useVendorsState';
import type { ProgramDetail } from '../../types/vendors';

type Props = { vendors: ReturnType<typeof useVendorsState> };

type Preset = { pct?: number; rebate?: number; mandatory?: boolean; label?: string };

const FIELD_ROWS: Array<{ key: string; label: string; color?: string; bold?: boolean; area?: boolean; grid?: '1' | 'full' }> = [
  { key: 'name', label: 'Program Name', color: 'var(--accent)', bold: true },
  { key: 'category', label: 'Category' },
  { key: 'savings', label: 'Typical Savings', color: 'var(--green)', bold: true },
  { key: 'avgSavings', label: 'Average Savings', bold: true },
  { key: 'rebateStructure', label: 'Rebate Structure', area: true, grid: 'full' },
  { key: 'roamoBenefit', label: "Roady's Monthly Benefit", color: 'var(--accent)', bold: true },
  { key: 'roaCommission', label: "Roady's Commission" },
  { key: 'reporting', label: 'Reporting Schedule' },
  { key: 'contractTerm', label: 'Contract Term' },
  { key: 'contact', label: 'Contact Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'vid', label: 'Vendor ID' },
];

export function ProgDetailsTab({ vendors }: Props) {
  const { progDetails, setProgDetails } = vendors;
  const [editMode, setEditMode] = useState<Record<number, boolean>>({});

  function updateField(idx: number, key: string, val: string) {
    const next = progDetails.map((p, i) => (i === idx ? { ...p, [key]: val } : p));
    setProgDetails(next);
  }

  function toggleEdit(idx: number) {
    setEditMode((m) => ({ ...m, [idx]: !m[idx] }));
  }

  function deletePD(idx: number) {
    const name = ((progDetails[idx] as Record<string, unknown>)?.name as string) || 'this program';
    if (!confirm(`Delete "${name}" from program details?`)) return;
    const next = progDetails.filter((_, i) => i !== idx);
    setProgDetails(next);
    // Shift edit-mode keys to match new indices.
    setEditMode((m) => {
      const out: Record<number, boolean> = {};
      for (const k of Object.keys(m)) {
        const n = +k;
        if (n < idx) out[n] = m[n];
        else if (n > idx) out[n - 1] = m[n];
      }
      return out;
    });
  }

  function addNew() {
    const blank: ProgramDetail = {
      vid: '', name: 'New Program', category: 'Category',
      savings: '', avgSavings: '', rebateStructure: '',
      roamoBenefit: '', roaCommission: '',
      contact: '', email: '', phone: '',
      contractTerm: '', reporting: '',
      notes: '', howItWorks: '',
    };
    setProgDetails([blank, ...progDetails]);
    setEditMode((m) => {
      const out: Record<number, boolean> = { 0: true };
      for (const k of Object.keys(m)) out[+k + 1] = m[+k];
      return out;
    });
  }

  function resetAll() {
    if (!confirm('Reset ALL program details to original defaults? This will overwrite any edits you have made.')) return;
    setProgDetails(JSON.parse(JSON.stringify(PROGRAM_DETAILS)));
    setEditMode({});
  }

  return (
    <div>
      <div className="sec-hdr">
        <div className="sec-title">Program Details</div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button className="btn" style={{ fontSize: '.78em' }} onClick={addNew}>➕ Add New</button>
          <button className="btn" style={{ fontSize: '.78em' }} onClick={resetAll}>↻ Reset All</button>
        </div>
      </div>

      <div>
        {progDetails.map((pd, idx) => {
          const p = pd as Record<string, string | undefined>;
          const editing = !!editMode[idx];
          const preset = ((ROI_DEFAULT_VENDOR_PRESETS as Record<string, Preset>)[p.vid || ''] || {}) as Preset;
          const defLine = preset.pct ? `${preset.pct}% Contract Savings` : preset.rebate ? `${fmtDollar(preset.rebate)}/mo Rebate` : '—';
          return (
            <div key={idx} className="panel" style={{ marginBottom: 16, borderColor: editing ? 'var(--green)' : undefined }}>
              <div className="panel-hdr">
                <div className="panel-title">{p.name || 'Untitled'}</div>
                <span className="badge" style={{ background: 'rgba(124,58,237,.12)', color: 'var(--purple)' }}>{p.category || '—'}</span>
                <span style={{ fontSize: '.7em', color: 'var(--green)', fontWeight: 600 }}>Default: {defLine}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {editing ? (
                    <>
                      <button className="btn btn-green" style={{ fontSize: '.7em', padding: '3px 10px' }} onClick={() => toggleEdit(idx)}>✓ Done</button>
                      <button style={{ background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.25)', color: 'var(--red)', borderRadius: 4, padding: '3px 8px', fontSize: '.68em', cursor: 'pointer', fontWeight: 700 }} onClick={() => deletePD(idx)}>✕ Delete</button>
                    </>
                  ) : (
                    <button className="btn" style={{ fontSize: '.7em', padding: '3px 10px' }} onClick={() => toggleEdit(idx)}>✏️ Edit</button>
                  )}
                </div>
              </div>

              {editing ? (
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 12 }}>
                    {FIELD_ROWS.map((f) => (
                      <div key={f.key} style={f.grid === 'full' ? { gridColumn: '1 / -1' } : undefined}>
                        <span className="field-label">{f.label}</span>
                        <PDField
                          value={p[f.key] || ''}
                          onChange={(v) => updateField(idx, f.key, v)}
                          area={f.area}
                          color={f.color}
                          bold={f.bold}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <span className="field-label">How It Works</span>
                    <PDField value={p.howItWorks || ''} onChange={(v) => updateField(idx, 'howItWorks', v)} area />
                  </div>
                  <div>
                    <span className="field-label">Notes</span>
                    <PDField value={p.notes || ''} onChange={(v) => updateField(idx, 'notes', v)} area />
                  </div>
                </div>
              ) : (
                <ViewBody p={p} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PDField({ value, onChange, area, color, bold }: { value: string; onChange: (v: string) => void; area?: boolean; color?: string; bold?: boolean }) {
  const style: React.CSSProperties = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: color || 'var(--text)',
    fontWeight: bold ? 700 : undefined,
    borderRadius: 4,
    padding: '4px 8px',
    width: '100%',
    fontSize: '.85em',
    fontFamily: 'inherit',
  };
  if (area) {
    return <textarea style={{ ...style, minHeight: 60, resize: 'vertical' }} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input style={style} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function ViewBody({ p }: { p: Record<string, string | undefined> }) {
  const contactLine = [
    p.contact,
    p.email ? <a key="em" href={`mailto:${p.email}`}>{p.email}</a> : '',
    p.phone,
  ].filter(Boolean);
  return (
    <div style={{ padding: '14px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', marginBottom: 14 }}>
        <ViewVal label="Typical Savings" value={p.savings} color="var(--green)" bold />
        <ViewVal label="Average Savings" value={p.avgSavings} bold />
        <ViewVal label="Rebate Structure" value={p.rebateStructure} full />
        <ViewVal label="Roady's Monthly Benefit" value={p.roamoBenefit} color="var(--accent)" bold />
        <ViewVal label="Roady's Commission" value={p.roaCommission} />
        <ViewVal label="Reporting" value={p.reporting} />
        <ViewVal label="Contract Term" value={p.contractTerm} />
        <div style={{ gridColumn: '1 / -1' }}>
          <span className="field-label">Contact</span>
          <div style={{ fontSize: '.85em', marginTop: 2 }}>
            {contactLine.length ? contactLine.reduce<React.ReactNode[]>((acc, el, i) => {
              if (i > 0) acc.push(' · ');
              acc.push(el);
              return acc;
            }, []) : <span style={{ color: 'var(--dim)' }}>—</span>}
          </div>
        </div>
      </div>
      {p.howItWorks && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
          <span className="field-label">How It Works</span>
          <div style={{ fontSize: '.85em', marginTop: 4 }}>{p.howItWorks}</div>
        </div>
      )}
      {p.notes && (
        <div style={{ fontSize: '.82em', color: 'var(--muted)', lineHeight: 1.5 }}>{p.notes}</div>
      )}
    </div>
  );
}

function ViewVal({ label, value, color, bold, full }: { label: string; value?: string; color?: string; bold?: boolean; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <span className="field-label">{label}</span>
      <div style={{ fontSize: '.85em', marginTop: 2, color: color || 'var(--text)', fontWeight: bold ? 700 : undefined }}>
        {value || <span style={{ color: 'var(--dim)' }}>—</span>}
      </div>
    </div>
  );
}
