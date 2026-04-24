import { useEffect, useMemo, useRef } from 'react';
import type { useValuePropsState } from '../../hooks/useValuePropsState';

type ChartCtor = new (el: HTMLCanvasElement, cfg: unknown) => { destroy: () => void };

export function ChartsTab({ vp }: { vp: ReturnType<typeof useValuePropsState> }) {
  const donut = useRef<HTMLCanvasElement>(null);
  const topLoc = useRef<HTMLCanvasElement>(null);
  const topFleet = useRef<HTMLCanvasElement>(null);
  const byState = useRef<HTMLCanvasElement>(null);

  const data = useMemo(() => {
    const tAgg = vp.vps.reduce((s, v) => s + (v.aggPot || 0), 0);
    const tFleet = vp.vps.reduce((s, v) => s + (v.fleetPot || 0), 0);
    const top = [...vp.vps].sort((a, b) => (b.totalPot || 0) - (a.totalPot || 0)).slice(0, 10);
    const byF: Record<string, number> = {};
    vp.vps.forEach((v) =>
      (v.fleetMatches || []).forEach((m) => { byF[m.fleet] = (byF[m.fleet] || 0) + m.gallons; }),
    );
    const topF = Object.entries(byF).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const byS: Record<string, number> = {};
    vp.vps.forEach((v) => { byS[v.state] = (byS[v.state] || 0) + 1; });
    const topS = Object.entries(byS).sort((a, b) => b[1] - a[1]).slice(0, 15);
    return { tAgg, tFleet, top, topF, topS };
  }, [vp.vps]);

  useEffect(() => {
    const Chart = (window as unknown as { Chart?: ChartCtor }).Chart;
    if (!Chart) return;
    const charts: Array<{ destroy: () => void }> = [];
    const baseBar = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    };
    if (donut.current) {
      charts.push(new Chart(donut.current, {
        type: 'doughnut',
        data: {
          labels: ['Aggregator', 'Fleet'],
          datasets: [{ data: [data.tAgg, data.tFleet], backgroundColor: ['#00d4ff', '#ffd600'], borderWidth: 0, cutout: '65%' }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { color: '#6B7A99' } } } },
      }));
    }
    if (topLoc.current) {
      charts.push(new Chart(topLoc.current, {
        type: 'bar',
        data: {
          labels: data.top.map((v) => (v.name || '').slice(0, 20)),
          datasets: [{ data: data.top.map((v) => v.totalPot || 0), backgroundColor: '#00d68f', borderRadius: 3 }],
        },
        options: {
          ...baseBar,
          indexAxis: 'y',
          scales: {
            x: { ticks: { color: '#6B7A99' }, grid: { color: 'rgba(30,42,69,.5)' } },
            y: { ticks: { color: '#E8EDF8', font: { size: 10 } }, grid: { display: false } },
          },
        },
      }));
    }
    if (topFleet.current && data.topF.length) {
      charts.push(new Chart(topFleet.current, {
        type: 'bar',
        data: {
          labels: data.topF.map((e) => e[0]),
          datasets: [{ data: data.topF.map((e) => e[1]), backgroundColor: '#00d4ff', borderRadius: 3 }],
        },
        options: {
          ...baseBar,
          indexAxis: 'y',
          scales: {
            x: { ticks: { color: '#6B7A99' }, grid: { color: 'rgba(30,42,69,.5)' } },
            y: { ticks: { color: '#E8EDF8', font: { size: 10 } }, grid: { display: false } },
          },
        },
      }));
    }
    if (byState.current && data.topS.length) {
      charts.push(new Chart(byState.current, {
        type: 'bar',
        data: {
          labels: data.topS.map((e) => e[0]),
          datasets: [{ data: data.topS.map((e) => e[1]), backgroundColor: '#a855f7', borderRadius: 3 }],
        },
        options: {
          ...baseBar,
          scales: {
            x: { ticks: { color: '#6B7A99' }, grid: { color: 'rgba(30,42,69,.5)' } },
            y: { ticks: { color: '#E8EDF8' }, grid: { display: false } },
          },
        },
      }));
    }
    return () => {
      for (const c of charts) { try { c.destroy(); } catch { /* ignore */ } }
    };
  }, [data]);

  return (
    <div className="vp-charts-grid">
      <div className="vp-chart-box">
        <div className="card-hdr" style={{ padding: 0, border: 0, marginBottom: 10 }}>Gallon Breakdown</div>
        <div className="vp-chart-wrap"><canvas ref={donut} /></div>
      </div>
      <div className="vp-chart-box">
        <div className="card-hdr" style={{ padding: 0, border: 0, marginBottom: 10 }}>Top Locations by Potential Gallons</div>
        <div className="vp-chart-wrap"><canvas ref={topLoc} /></div>
      </div>
      <div className="vp-chart-box">
        <div className="card-hdr" style={{ padding: 0, border: 0, marginBottom: 10 }}>Top Fleets by Raw Gallons</div>
        <div className="vp-chart-wrap"><canvas ref={topFleet} /></div>
      </div>
      <div className="vp-chart-box">
        <div className="card-hdr" style={{ padding: 0, border: 0, marginBottom: 10 }}>Locations by State</div>
        <div className="vp-chart-wrap"><canvas ref={byState} /></div>
      </div>
    </div>
  );
}
