const fs = require('fs');

const CHAIN_KEYWORDS = ['pilot', 'flying j', "love's", 'loves travel', 'ta travel', 'travelcenters of america', 'petro stopping'];

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const exclusion = JSON.parse(fs.readFileSync('scratchpad/crm-exclusion-list.json', 'utf8'));
const exclusionKeys = new Set(exclusion.map(e => norm(e.company) + '|' + e.state + '|' + norm(e.city)));
const exclusionNames = new Set(exclusion.map(e => norm(e.company)));

const files = fs.readdirSync('scratchpad/crm-research-raw').filter(f => f.endsWith('.json'));
let raw = [];
files.forEach(f => {
  const arr = JSON.parse(fs.readFileSync('scratchpad/crm-research-raw/' + f, 'utf8'));
  raw = raw.concat(arr);
});

const seen = new Set();
const kept = [];
const stateCounts = {};
raw.forEach(r => {
  const nCompany = norm(r.company);
  const nCity = norm(r.city);
  const key = nCompany + '|' + r.state + '|' + nCity;
  if (seen.has(key)) return;
  if (exclusionKeys.has(key) || exclusionNames.has(nCompany)) return;
  if (CHAIN_KEYWORDS.some(k => nCompany.includes(k))) return;
  seen.add(key);
  kept.push(r);
  stateCounts[r.state] = (stateCounts[r.state] || 0) + 1;
});

const today = '2026-07-13';
const escJs = s => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lines = kept.map((r, i) => {
  const id = 'CRM-' + String(i + 1).padStart(3, '0');
  const notes = (r.source_note || '') + (r.phone ? '' : ' Phone not confirmed.') + (r.email ? '' : ' Email not confirmed.');
  return "  {id:'" + id + "',company:'" + escJs(r.company) + "',contact:'" + escJs(r.contact) + "',phone:'" + escJs(r.phone) +
    "',email:'" + escJs(r.email) + "',street:'" + escJs(r.street) + "',city:'" + escJs(r.city) + "',state:'" + escJs(r.state) +
    "',zip:'" + escJs(r.zip) + "',exit:'" + escJs(r.exit) + "',lanes:'" + escJs(r.lanes) +
    "',stage:'Prospect',priority:'Medium',owner:'',source:'Market Research',locations:1,estGallons:0,dealValue:0,followUp:''," +
    "notes:'" + escJs(notes.trim()) + "',created:'" + today + "',activity:[{text:'Identified via market research',date:'" + today + "',by:'Research',type:'note'}]}";
});

const out = "const CRM_RESEARCHED_LEADS = [\n" + lines.join(',\n') + "\n];\n";
fs.writeFileSync('scratchpad/crm-prospects-final.js', out);

const allStates = ['AL','AZ','AR','CA','CO','CT','DE','FL','GA','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const thin = allStates.filter(s => (stateCounts[s] || 0) < 1);
console.log('raw', raw.length, 'kept', kept.length, 'excluded', raw.length - kept.length);
console.log('per-state counts', stateCounts);
console.log('states with zero qualifying results:', thin);
