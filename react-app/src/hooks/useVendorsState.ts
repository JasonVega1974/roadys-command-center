import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AOM_ENROLL_IDS,
  AOM_ROI_SEED,
  COKE_ENROLL_IDS,
  COKE_ROI_SEED,
  DAS_ENROLL_IDS,
  DAS_ROI_SEED,
  ENT_ROI_SEED,
  FB_ENROLL_IDS,
  FB_ROI_SEED,
  HL_ROI_SEED,
  LYNCO_ENROLL_IDS,
  LYNCO_ROI_SEED,
  PROGRAM_DETAILS,
  ROI_DEFAULT_VENDOR_PRESETS,
  SYSCO_ENROLL_SEED,
  SYSCO_ROI_SEED,
  TPC_ENROLL_IDS,
  TPC_ROI_SEED,
  VP_VENDORS,
} from '../data/vendors';
import { getRoadysSB } from '../lib/supabase';
import type {
  ProgramDetail,
  ROIRecord,
  SyscoStatus,
  VPEnroll,
  VendorDefaults,
} from '../types/vendors';

const LS_VP_ENROLL = 'roadys_vp_enroll';
const LS_ROI_DATA = 'roadys_roi_data';
const LS_VENDOR_DEFAULTS = 'roadys_roi_vendor_defaults';
const LS_PROGRAM_DETAILS = 'roadys_program_details';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function mergeROI(data: ROIRecord[], seed: ROIRecord[]): ROIRecord[] {
  const out = [...data];
  for (const r of seed) {
    const idx = out.findIndex((d) => d.stop_id === r.stop_id && d.vendor_id === r.vendor_id);
    if (idx !== -1) out[idx] = r;
    else out.push(r);
  }
  return out;
}

function addEnroll(enroll: VPEnroll, stopIds: readonly string[], vendorId: string, value = true): VPEnroll {
  const next = { ...enroll };
  for (const sid of stopIds) next[sid] = { ...(next[sid] || {}), [vendorId]: value };
  return next;
}

// Sysco has a three-state status (active/pending/refused). Derived at read time.
function deriveSyscoStatus(): SyscoStatus {
  const map: SyscoStatus = {};
  (SYSCO_ENROLL_SEED as { active: string[]; pending: string[]; refused: string[] }).active.forEach(
    (s) => (map[s] = 'active'),
  );
  (SYSCO_ENROLL_SEED as { active: string[]; pending: string[]; refused: string[] }).pending.forEach(
    (s) => (map[s] = 'pending'),
  );
  (SYSCO_ENROLL_SEED as { active: string[]; pending: string[]; refused: string[] }).refused.forEach(
    (s) => (map[s] = 'refused'),
  );
  return map;
}

// One-shot seeding, matching the legacy IIFE pattern. Each flag seeds once.
function applySeeds(initialEnroll: VPEnroll, initialROI: ROIRecord[]): {
  enroll: VPEnroll;
  roi: ROIRecord[];
} {
  let enroll = initialEnroll;
  let roi = initialROI;

  const seededOnce = (flag: string, fn: () => void) => {
    if (localStorage.getItem(flag)) return;
    fn();
    localStorage.setItem(flag, '1');
  };

  seededOnce('roadys_sysco_seeded', () => {
    const s = SYSCO_ENROLL_SEED as { active: string[]; pending: string[]; refused: string[] };
    enroll = addEnroll(enroll, s.active, 'V00010', true);
    enroll = addEnroll(enroll, s.pending, 'V00010', true);
    enroll = addEnroll(enroll, s.refused, 'V00010', false);
  });
  seededOnce('roadys_fb_enroll_seeded', () => {
    enroll = addEnroll(enroll, FB_ENROLL_IDS as string[], 'V00002', true);
  });
  seededOnce('roadys_sysco_roi_seeded', () => {
    roi = mergeROI(roi, SYSCO_ROI_SEED as ROIRecord[]);
  });
  seededOnce('roadys_fb_roi_seeded', () => {
    roi = mergeROI(roi, FB_ROI_SEED as ROIRecord[]);
  });
  seededOnce('roadys_lynco_roi_seeded', () => {
    roi = mergeROI(roi, LYNCO_ROI_SEED as ROIRecord[]);
  });
  seededOnce('roadys_lynco_enroll_seeded', () => {
    enroll = addEnroll(enroll, LYNCO_ENROLL_IDS as string[], 'V00022', true);
  });
  seededOnce('roadys_hl_roi_seeded_v2', () => {
    roi = mergeROI(roi, HL_ROI_SEED as ROIRecord[]);
    enroll = addEnroll(enroll, (HL_ROI_SEED as ROIRecord[]).map((r) => r.stop_id), 'V00232', true);
  });
  seededOnce('roadys_ent_roi_seeded', () => {
    roi = mergeROI(roi, ENT_ROI_SEED as ROIRecord[]);
  });
  seededOnce('roadys_aom_roi_seeded', () => {
    roi = mergeROI(roi, AOM_ROI_SEED as ROIRecord[]);
    enroll = addEnroll(enroll, AOM_ENROLL_IDS as string[], 'V00005', true);
  });
  seededOnce('roadys_tpc_roi_seeded', () => {
    roi = mergeROI(roi, TPC_ROI_SEED as ROIRecord[]);
    enroll = addEnroll(enroll, TPC_ENROLL_IDS as string[], 'V00112', true);
  });
  seededOnce('roadys_coke_roi_seeded_v2', () => {
    roi = mergeROI(roi, COKE_ROI_SEED as ROIRecord[]);
    enroll = addEnroll(enroll, COKE_ENROLL_IDS as string[], 'V00033', true);
  });
  seededOnce('roadys_das_roi_seeded', () => {
    roi = mergeROI(roi, DAS_ROI_SEED as ROIRecord[]);
    enroll = addEnroll(enroll, DAS_ENROLL_IDS as string[], 'V00036', true);
  });

  return { enroll, roi };
}

export type VendorsState = {
  enroll: VPEnroll;
  roi: ROIRecord[];
  defaults: VendorDefaults;
  progDetails: ProgramDetail[];
  syscoStatus: SyscoStatus;
};

export type VendorsActions = {
  setEnrolled: (stopId: string, vendorId: string, enrolled: boolean) => void;
  bulkSetEnroll: (rows: Array<{ stop_id: string; vendor_id: string; enrolled: boolean }>) => void;
  upsertROI: (r: ROIRecord) => void;
  bulkUpsertROI: (rows: ROIRecord[]) => void;
  deleteROI: (stopId: string, vendorId: string) => void;
  setVendorDefault: (vendorId: string, def: { pct: number; rebate: number }) => void;
  setProgDetails: (rows: ProgramDetail[]) => void;
};

// Initial bootstrap runs once per page-load; the one-time seed flags in
// localStorage guarantee idempotence across reloads.
function bootstrap(): VendorsState {
  const enroll0 = safeParse<VPEnroll>(localStorage.getItem(LS_VP_ENROLL), {});
  const roi0 = safeParse<ROIRecord[]>(localStorage.getItem(LS_ROI_DATA), []);
  let defaults = safeParse<VendorDefaults>(localStorage.getItem(LS_VENDOR_DEFAULTS), {});
  const progRaw = safeParse<ProgramDetail[] | null>(localStorage.getItem(LS_PROGRAM_DETAILS), null);
  const progDetails = progRaw && progRaw.length ? progRaw : JSON.parse(JSON.stringify(PROGRAM_DETAILS));

  // Seed defaults from presets on first load (legacy 'roadys_vd_v2' flag).
  if (!Object.keys(defaults).length || !localStorage.getItem('roadys_vd_v2')) {
    const next = { ...defaults };
    for (const [vid, d] of Object.entries(ROI_DEFAULT_VENDOR_PRESETS as Record<string, { pct?: number; rebate?: number }>)) {
      if (d.pct || d.rebate) next[vid] = { pct: d.pct || 0, rebate: d.rebate || 0 };
    }
    defaults = next;
    localStorage.setItem(LS_VENDOR_DEFAULTS, JSON.stringify(defaults));
    localStorage.setItem('roadys_vd_v2', '1');
  }

  const { enroll, roi } = applySeeds(enroll0, roi0);
  if (enroll !== enroll0) localStorage.setItem(LS_VP_ENROLL, JSON.stringify(enroll));
  if (roi !== roi0) localStorage.setItem(LS_ROI_DATA, JSON.stringify(roi));

  return { enroll, roi, defaults, progDetails, syscoStatus: deriveSyscoStatus() };
}

export function useVendorsState(): VendorsState & VendorsActions & { remoteLoaded: boolean } {
  const [state, setState] = useState<VendorsState>(() => bootstrap());
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const saveEnrollRef = useRef(state.enroll);
  const saveROIRef = useRef(state.roi);
  const saveDefaultsRef = useRef(state.defaults);
  const saveProgRef = useRef(state.progDetails);

  // Persist on change (matches legacy save* helpers).
  useEffect(() => {
    if (saveEnrollRef.current !== state.enroll) {
      localStorage.setItem(LS_VP_ENROLL, JSON.stringify(state.enroll));
      saveEnrollRef.current = state.enroll;
    }
  }, [state.enroll]);
  useEffect(() => {
    if (saveROIRef.current !== state.roi) {
      localStorage.setItem(LS_ROI_DATA, JSON.stringify(state.roi));
      saveROIRef.current = state.roi;
    }
  }, [state.roi]);
  useEffect(() => {
    if (saveDefaultsRef.current !== state.defaults) {
      localStorage.setItem(LS_VENDOR_DEFAULTS, JSON.stringify(state.defaults));
      saveDefaultsRef.current = state.defaults;
    }
  }, [state.defaults]);
  useEffect(() => {
    if (saveProgRef.current !== state.progDetails) {
      localStorage.setItem(LS_PROGRAM_DETAILS, JSON.stringify(state.progDetails));
      saveProgRef.current = state.progDetails;
    }
  }, [state.progDetails]);

  // Async Supabase hydrate — merges server rows into local state, never
  // destructively overwrites a local record the server doesn't know about.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = getRoadysSB();
      try {
        const [enrollRes, roiRes] = await Promise.all([
          sb.from('vp_enroll').select('stop_id,vendor_id,enrolled,status'),
          sb.from('vp_roi').select('stop_id,vendor_id,monthly_spend,rebate_pct,rebate_amount,savings_pct,cost_savings,rebate_desc'),
        ]);
        if (cancelled) return;
        setState((prev) => {
          let enroll = prev.enroll;
          let roi = prev.roi;
          if (!enrollRes.error && enrollRes.data) {
            enroll = { ...prev.enroll };
            for (const row of enrollRes.data as Array<{ stop_id: string; vendor_id: string; enrolled: boolean }>) {
              enroll[row.stop_id] = { ...(enroll[row.stop_id] || {}), [row.vendor_id]: !!row.enrolled };
            }
          }
          if (!roiRes.error && roiRes.data) {
            roi = [...prev.roi];
            for (const row of roiRes.data as ROIRecord[]) {
              const idx = roi.findIndex((r) => r.stop_id === row.stop_id && r.vendor_id === row.vendor_id);
              if (idx === -1) roi.push(row);
            }
          }
          return { ...prev, enroll, roi };
        });
      } catch {
        // offline or RLS failure — localStorage path still works
      } finally {
        if (!cancelled) setRemoteLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setEnrolled = useCallback((stopId: string, vendorId: string, enrolled: boolean) => {
    setState((prev) => ({
      ...prev,
      enroll: { ...prev.enroll, [stopId]: { ...(prev.enroll[stopId] || {}), [vendorId]: enrolled } },
    }));
    // Fire-and-forget Supabase sync.
    getRoadysSB()
      .from('vp_enroll')
      .upsert(
        {
          stop_id: stopId,
          vendor_id: vendorId,
          vendor_name: (VP_VENDORS as { id: string; name: string }[]).find((v) => v.id === vendorId)?.name || vendorId,
          enrolled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'stop_id,vendor_id' },
      )
      .then(() => {}, () => {});
  }, []);

  const bulkSetEnroll = useCallback((rows: Array<{ stop_id: string; vendor_id: string; enrolled: boolean }>) => {
    setState((prev) => {
      const next = { ...prev.enroll };
      for (const r of rows) next[r.stop_id] = { ...(next[r.stop_id] || {}), [r.vendor_id]: r.enrolled };
      return { ...prev, enroll: next };
    });
    const payload = rows.map((r) => ({
      stop_id: r.stop_id,
      vendor_id: r.vendor_id,
      vendor_name: (VP_VENDORS as { id: string; name: string }[]).find((v) => v.id === r.vendor_id)?.name || r.vendor_id,
      enrolled: r.enrolled,
      updated_at: new Date().toISOString(),
    }));
    getRoadysSB().from('vp_enroll').upsert(payload, { onConflict: 'stop_id,vendor_id' }).then(() => {}, () => {});
  }, []);

  const upsertROI = useCallback((r: ROIRecord) => {
    setState((prev) => {
      const roi = [...prev.roi];
      const idx = roi.findIndex((x) => x.stop_id === r.stop_id && x.vendor_id === r.vendor_id);
      if (idx === -1) roi.push(r);
      else roi[idx] = r;
      return { ...prev, roi };
    });
    getRoadysSB().from('vp_roi').upsert(r, { onConflict: 'stop_id,vendor_id' }).then(() => {}, () => {});
  }, []);

  const bulkUpsertROI = useCallback((rows: ROIRecord[]) => {
    setState((prev) => {
      const roi = [...prev.roi];
      for (const r of rows) {
        const idx = roi.findIndex((x) => x.stop_id === r.stop_id && x.vendor_id === r.vendor_id);
        if (idx === -1) roi.push(r);
        else roi[idx] = r;
      }
      return { ...prev, roi };
    });
    getRoadysSB().from('vp_roi').upsert(rows, { onConflict: 'stop_id,vendor_id' }).then(() => {}, () => {});
  }, []);

  const deleteROI = useCallback((stopId: string, vendorId: string) => {
    setState((prev) => ({
      ...prev,
      roi: prev.roi.filter((r) => !(r.stop_id === stopId && r.vendor_id === vendorId)),
    }));
    getRoadysSB().from('vp_roi').delete().match({ stop_id: stopId, vendor_id: vendorId }).then(() => {}, () => {});
  }, []);

  const setVendorDefault = useCallback((vendorId: string, def: { pct: number; rebate: number }) => {
    setState((prev) => ({ ...prev, defaults: { ...prev.defaults, [vendorId]: def } }));
  }, []);

  const setProgDetails = useCallback((rows: ProgramDetail[]) => {
    setState((prev) => ({ ...prev, progDetails: rows }));
  }, []);

  return {
    ...state,
    remoteLoaded,
    setEnrolled,
    bulkSetEnroll,
    upsertROI,
    bulkUpsertROI,
    deleteROI,
    setVendorDefault,
    setProgDetails,
  };
}
