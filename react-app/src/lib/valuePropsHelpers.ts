export function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n).toLocaleString();
  return Math.round(n).toString();
}

export function fG(n: number): string {
  return Math.round(n).toLocaleString();
}

export function titleCaseCity(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (c) => c.toLowerCase());
}

// Parse comma / tab / pipe separated gallon report lines into clean records.
export function parseGallonData(
  text: string,
): Array<{ city: string; state: string; gallons: number }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const out: Array<{ city: string; state: string; gallons: number }> = [];
  for (const line of lines) {
    let parts: string[];
    if (line.includes('\t')) parts = line.split('\t');
    else if (line.includes('|')) parts = line.split('|');
    else parts = line.split(',');
    parts = parts.map((p) => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length < 3) continue;
    const city = parts[0];
    const state = parts[1];
    const gal = parseFloat(parts[2]);
    if (!gal && Number.isNaN(parseFloat(parts[2]))) continue;
    if (/^city$/i.test(city) || /^state$/i.test(state)) continue;
    if (!city || !state) continue;
    out.push({
      city: city.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (c) => c.toLowerCase()),
      state: state.toUpperCase().trim().slice(0, 2),
      gallons: gal || 0,
    });
  }
  return out;
}
