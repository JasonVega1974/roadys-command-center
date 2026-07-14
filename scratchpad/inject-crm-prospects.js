const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const seedSrc = fs.readFileSync('scratchpad/crm-prospects-final.js', 'utf8');
const m = seedSrc.match(/const CRM_RESEARCHED_LEADS = (\[[\s\S]*\]);/);
if (!m) throw new Error('CRM_RESEARCHED_LEADS not found in generated file');
const arrayLiteral = m[1];

const anchor = /function crmSampleData\(\)\{ return \[[\s\S]*?\];\}/;
const matches = html.match(anchor);
if (!matches || matches.length !== 1) throw new Error('expected exactly 1 match for crmSampleData(), found ' + (matches ? matches.length : 0));

const replacement = 'function crmSampleData(){ return ' + arrayLiteral + ';}';
const newHtml = html.replace(anchor, () => replacement);
fs.writeFileSync('index.html', newHtml);
console.log('injected, new file length', newHtml.length);
