const fs = require('fs');
const src = fs.readFileSync('scratchpad/crm-prospects-final.js', 'utf8');
const arr = new Function(src + '\nreturn CRM_RESEARCHED_LEADS;')();
const removeIds = new Set(['CRM-176','CRM-503','CRM-521','CRM-544','CRM-553','CRM-574','CRM-595','CRM-622','CRM-009','CRM-569']);
const kept = arr.filter(r => !removeIds.has(r.id));
console.log('before', arr.length, 'after', kept.length, 'removed', arr.length - kept.length);

const escJs = s => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lines = kept.map((r, i) => {
  const id = 'CRM-' + String(i + 1).padStart(3, '0');
  return "  {id:'" + id + "',company:'" + escJs(r.company) + "',contact:'" + escJs(r.contact) + "',phone:'" + escJs(r.phone) +
    "',email:'" + escJs(r.email) + "',street:'" + escJs(r.street) + "',city:'" + escJs(r.city) + "',state:'" + escJs(r.state) +
    "',zip:'" + escJs(r.zip) + "',exit:'" + escJs(r.exit) + "',lanes:'" + escJs(r.lanes) +
    "',stage:'" + r.stage + "',priority:'" + r.priority + "',owner:'',source:'Market Research',locations:1,estGallons:0,dealValue:0,followUp:''," +
    "notes:'" + escJs(r.notes) + "',created:'" + r.created + "',activity:[{text:'Identified via market research',date:'" + r.created + "',by:'Research',type:'note'}]}";
});
const out = 'const CRM_RESEARCHED_LEADS = [\n' + lines.join(',\n') + '\n];\n';
fs.writeFileSync('scratchpad/crm-prospects-final.js', out);
console.log('rewritten');
