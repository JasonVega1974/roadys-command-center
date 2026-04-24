import { useCallback, useEffect, useRef, useState } from 'react';
import { FD } from '../data/valueProps';
import {
  GEO,
  seedGeo,
  synthesizeCoord,
} from '../lib/geo';
import {
  deleteFleetStatus,
  deleteValueProp,
  loadFleetStatus,
  loadGeoCache,
  loadValueProps,
  saveFleetStatus,
  saveValueProp,
} from '../lib/valuePropsSync';
import type { ImportedFleets, ValueProp } from '../types/valueProps';

const LS_VPS = 'vp_data_v5';
const LS_GEO = 'vp_geo5';
const LS_TOMBSTONES = 'vp_tombstones';
const LS_EXCLUDED = 'vp_excluded_fleets';
const LS_IMPORTED = 'vp_imported_fleets';

export type SyncStatus = 'loading' | 'ok' | 'err';

export type ValuePropsState = {
  vps: ValueProp[];
  FN: string[];
  FR: Array<[number, string, string, number]>;
  excludedFleets: Set<string>;
  syncStatus: SyncStatus;
  syncLabel: string;
};

export type ValuePropsActions = {
  upsertVP: (vp: ValueProp) => Promise<void>;
  deleteVP: (id: string) => Promise<boolean>;
  toggleExclude: (fleetName: string) => void;
  renameFleet: (oldName: string, newName: string) => boolean;
  removeFleet: (fleetName: string) => number;
  importFleet: (
    fleetName: string,
    records: Array<{ city: string; state: string; gallons: number }>,
  ) => number;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getTombstones(): Set<string> {
  return new Set(safeParse<string[]>(localStorage.getItem(LS_TOMBSTONES), []));
}
function saveTombstones(set: Set<string>): void {
  try {
    localStorage.setItem(LS_TOMBSTONES, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

// Load previously imported fleets from localStorage into the provided FN/FR arrays.
// Mutates FN/FR in place — mirroring the legacy `loadImportedData()`.
function loadImportedData(FN: string[], FR: Array<[number, string, string, number]>): void {
  const imported = safeParse<ImportedFleets>(localStorage.getItem(LS_IMPORTED), {});
  for (const fn of Object.keys(imported)) {
    let idx = FN.indexOf(fn);
    if (idx === -1) {
      FN.push(fn);
      idx = FN.length - 1;
    }
    for (const r of imported[fn]) {
      FR.push([idx, r.c, r.s, r.g]);
      const gk = (r.c + '|' + r.s).toUpperCase();
      if (!GEO[gk]) {
        const c = synthesizeCoord(r.c, r.s);
        if (c) GEO[gk] = c;
      }
    }
  }
}

function saveImportedFleet(
  fleetName: string,
  FN: string[],
  FR: Array<[number, string, string, number]>,
): void {
  try {
    const imported = safeParse<ImportedFleets>(localStorage.getItem(LS_IMPORTED), {});
    const idx = FN.indexOf(fleetName);
    if (idx === -1) return;
    imported[fleetName] = FR.filter((r) => r[0] === idx).map((r) => ({ c: r[1], s: r[2], g: r[3] }));
    localStorage.setItem(LS_IMPORTED, JSON.stringify(imported));
  } catch {
    /* ignore */
  }
}

function deleteImportedFleet(fleetName: string): void {
  try {
    const imported = safeParse<ImportedFleets>(localStorage.getItem(LS_IMPORTED), {});
    delete imported[fleetName];
    localStorage.setItem(LS_IMPORTED, JSON.stringify(imported));
  } catch {
    /* ignore */
  }
}

function renameImportedFleet(oldName: string, newName: string): void {
  try {
    const imported = safeParse<ImportedFleets>(localStorage.getItem(LS_IMPORTED), {});
    if (imported[oldName] !== undefined) {
      imported[newName] = imported[oldName];
      delete imported[oldName];
      localStorage.setItem(LS_IMPORTED, JSON.stringify(imported));
    }
  } catch {
    /* ignore */
  }
}

function bootstrap(): ValuePropsState {
  const vps = safeParse<ValueProp[]>(localStorage.getItem(LS_VPS), []);
  const localGeo = safeParse<Record<string, [number, number]> | null>(
    localStorage.getItem(LS_GEO),
    null,
  );
  seedGeo(localGeo);
  // Clone fleet data so mutations (imports/renames/removes) don't leak into the
  // shared data module between hook instances (shouldn't happen, but cheap).
  const FN = [...FD.f];
  const FR = FD.r.map((r) => [...r] as [number, string, string, number]);
  loadImportedData(FN, FR);
  const excludedFleets = new Set(safeParse<string[]>(localStorage.getItem(LS_EXCLUDED), []));
  return {
    vps,
    FN,
    FR,
    excludedFleets,
    syncStatus: 'loading',
    syncLabel: vps.length ? `Local data (${vps.length} locations)` : 'Connecting…',
  };
}

export function useValuePropsState(): ValuePropsState & ValuePropsActions {
  const [state, setState] = useState<ValuePropsState>(() => bootstrap());
  // FN/FR mutate in place (the legacy code did the same) because the fleet
  // dataset is ~16K entries and copying on every import would be wasteful.
  const fnRef = useRef(state.FN);
  const frRef = useRef(state.FR);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const localCount = state.vps.length;
      // Fire both in parallel
      const [vpRes, fleetStatus, geoRows] = await Promise.all([
        loadValueProps(),
        loadFleetStatus(),
        loadGeoCache(),
      ]);
      if (cancelled) return;
      if (geoRows) {
        seedGeo(geoRows);
        try {
          localStorage.setItem(LS_GEO, JSON.stringify(GEO));
        } catch {
          /* quota — skip */
        }
      }
      if (!vpRes.ok) {
        setState((prev) => ({
          ...prev,
          syncStatus: 'ok',
          syncLabel: localCount
            ? `Local data (${localCount} locations)`
            : 'Offline — no local data',
        }));
        if (fleetStatus) {
          setState((prev) => {
            const merged = new Set([...prev.excludedFleets, ...fleetStatus]);
            try {
              localStorage.setItem(LS_EXCLUDED, JSON.stringify([...merged]));
            } catch { /* ignore */ }
            return { ...prev, excludedFleets: merged };
          });
        }
        return;
      }

      let remoteVPs = vpRes.data;

      // Tombstone reconciliation — remote records still listed for IDs the
      // user already deleted locally get filtered out and re-sent for delete.
      const tombstones = getTombstones();
      if (tombstones.size) {
        const resurrected: string[] = [];
        remoteVPs = remoteVPs.filter((v) => {
          if (tombstones.has(v.id)) {
            resurrected.push(v.id);
            return false;
          }
          return true;
        });
        for (const rid of resurrected) await deleteValueProp(rid);
        // Trim tombstones that remote agrees are gone
        const stillRemote = new Set(remoteVPs.map((v) => v.id));
        let changed = false;
        for (const tid of [...tombstones]) {
          if (!stillRemote.has(tid) && resurrected.indexOf(tid) === -1) {
            tombstones.delete(tid);
            changed = true;
          }
        }
        if (changed) saveTombstones(tombstones);
      }

      setState((prev) => {
        let vps = prev.vps;
        if (localCount > 0 && remoteVPs.length === 0) {
          // Push local up to cloud
          for (const vp of vps) saveValueProp(vp);
          try {
            localStorage.setItem(LS_VPS, JSON.stringify(vps));
          } catch { /* ignore */ }
          return {
            ...prev,
            syncStatus: 'ok',
            syncLabel: `Synced — uploaded ${localCount} from local`,
          };
        }
        if (remoteVPs.length > 0) {
          const remoteIds = new Set(remoteVPs.map((v) => v.id));
          const localOnly = vps.filter((v) => !remoteIds.has(v.id));
          vps = [...remoteVPs, ...localOnly];
          for (const vp of localOnly) saveValueProp(vp);
          try {
            localStorage.setItem(LS_VPS, JSON.stringify(vps));
          } catch { /* ignore */ }
          return {
            ...prev,
            vps,
            syncStatus: 'ok',
            syncLabel:
              `Synced — ${vps.length} locations` +
              (localOnly.length ? ` (+${localOnly.length} uploaded)` : ''),
          };
        }
        return { ...prev, syncStatus: 'ok', syncLabel: 'Connected — 0 locations' };
      });

      if (fleetStatus) {
        setState((prev) => {
          const localOnly = [...prev.excludedFleets].filter((fn) => !fleetStatus.has(fn));
          const merged = new Set([...prev.excludedFleets, ...fleetStatus]);
          for (const fn of localOnly) saveFleetStatus(fn, 'inactive');
          try {
            localStorage.setItem(LS_EXCLUDED, JSON.stringify([...merged]));
          } catch { /* ignore */ }
          return { ...prev, excludedFleets: merged };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only run on mount — bootstrap already pulled local state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist vps whenever they change.
  useEffect(() => {
    try {
      localStorage.setItem(LS_VPS, JSON.stringify(state.vps));
    } catch {
      /* quota — skip */
    }
  }, [state.vps]);

  const upsertVP = useCallback(async (vp: ValueProp) => {
    setState((prev) => {
      const idx = prev.vps.findIndex((v) => v.id === vp.id);
      const vps = idx === -1 ? [...prev.vps, vp] : prev.vps.map((v) => (v.id === vp.id ? vp : v));
      return { ...prev, vps, syncStatus: 'ok', syncLabel: 'Saving…' };
    });
    const ok = await saveValueProp(vp);
    setState((prev) => ({
      ...prev,
      syncStatus: 'ok',
      syncLabel: ok ? 'Saved to cloud ✓' : 'Saved locally ✓',
    }));
  }, []);

  const deleteVP = useCallback(async (id: string): Promise<boolean> => {
    let prevVPs: ValueProp[] = [];
    setState((prev) => {
      prevVPs = prev.vps;
      return { ...prev, vps: prev.vps.filter((v) => v.id !== id) };
    });
    const ok = await deleteValueProp(id);
    if (!ok) {
      setState((prev) => ({
        ...prev,
        vps: prevVPs,
        syncStatus: 'err',
        syncLabel: '⚠️ Delete failed — record restored',
      }));
      return false;
    }
    const tomb = getTombstones();
    tomb.add(id);
    saveTombstones(tomb);
    setState((prev) => ({ ...prev, syncStatus: 'ok', syncLabel: 'Deleted ✓' }));
    return true;
  }, []);

  const toggleExclude = useCallback((fleetName: string) => {
    setState((prev) => {
      const next = new Set(prev.excludedFleets);
      const nowInactive = !next.has(fleetName);
      if (nowInactive) next.add(fleetName);
      else next.delete(fleetName);
      try {
        localStorage.setItem(LS_EXCLUDED, JSON.stringify([...next]));
      } catch { /* ignore */ }
      saveFleetStatus(fleetName, nowInactive ? 'inactive' : 'active');
      return { ...prev, excludedFleets: next };
    });
  }, []);

  const renameFleet = useCallback((oldName: string, newName: string): boolean => {
    const FN = fnRef.current;
    if (!newName.trim()) return false;
    if (newName === oldName) return false;
    if (FN.includes(newName)) return false;
    const idx = FN.indexOf(oldName);
    if (idx === -1) return false;
    FN[idx] = newName;
    renameImportedFleet(oldName, newName);
    setState((prev) => {
      const excl = new Set(prev.excludedFleets);
      if (excl.has(oldName)) {
        excl.delete(oldName);
        excl.add(newName);
        try {
          localStorage.setItem(LS_EXCLUDED, JSON.stringify([...excl]));
        } catch { /* ignore */ }
        deleteFleetStatus(oldName);
        saveFleetStatus(newName, 'inactive');
      }
      return { ...prev, FN: [...FN], excludedFleets: excl };
    });
    return true;
  }, []);

  const removeFleet = useCallback((fleetName: string): number => {
    const FN = fnRef.current;
    const FR = frRef.current;
    const idx = FN.indexOf(fleetName);
    if (idx === -1) return 0;
    const removed = FR.filter((r) => r[0] === idx).length;
    // Rebuild FN/FR in place with shifted indices.
    const newFN = FN.filter((_, i) => i !== idx);
    const newFR = FR.filter((r) => r[0] !== idx).map(
      (r) => [r[0] > idx ? r[0] - 1 : r[0], r[1], r[2], r[3]] as [number, string, string, number],
    );
    FN.length = 0;
    newFN.forEach((n) => FN.push(n));
    FR.length = 0;
    newFR.forEach((r) => FR.push(r));
    deleteImportedFleet(fleetName);
    deleteFleetStatus(fleetName);
    setState((prev) => {
      const excl = new Set(prev.excludedFleets);
      if (excl.has(fleetName)) {
        excl.delete(fleetName);
        try {
          localStorage.setItem(LS_EXCLUDED, JSON.stringify([...excl]));
        } catch { /* ignore */ }
      }
      return { ...prev, FN: [...FN], FR: [...FR], excludedFleets: excl };
    });
    return removed;
  }, []);

  const importFleet = useCallback(
    (
      fleetName: string,
      records: Array<{ city: string; state: string; gallons: number }>,
    ): number => {
      const FN = fnRef.current;
      const FR = frRef.current;
      let idx = FN.indexOf(fleetName);
      if (idx === -1) {
        FN.push(fleetName);
        idx = FN.length - 1;
      }
      let added = 0;
      for (const r of records) {
        FR.push([idx, r.city, r.state, r.gallons]);
        const gk = (r.city + '|' + r.state).toUpperCase();
        if (!GEO[gk]) {
          const c = synthesizeCoord(r.city, r.state);
          if (c) GEO[gk] = c;
        }
        added++;
      }
      saveImportedFleet(fleetName, FN, FR);
      setState((prev) => ({ ...prev, FN: [...FN], FR: [...FR] }));
      return added;
    },
    [],
  );

  return {
    ...state,
    upsertVP,
    deleteVP,
    toggleExclude,
    renameFleet,
    removeFleet,
    importFleet,
  };
}
