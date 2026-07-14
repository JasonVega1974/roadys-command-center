const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/const MEMBERS = (\[[\s\S]*?\]);/);
if (!m) throw new Error('MEMBERS array not found in index.html');
const members = JSON.parse(m[1]);
const exclusion = members.map(x => ({
  company: x.company || '',
  name: x.name || '',
  city: x.city || '',
  state: x.state || '',
  group: x.group || '',
}));
fs.writeFileSync('scratchpad/crm-exclusion-list.json', JSON.stringify(exclusion, null, 2));
const byGroup = {};
exclusion.forEach(e => { byGroup[e.group] = (byGroup[e.group] || 0) + 1; });
console.log('total', exclusion.length, 'by group', byGroup);
