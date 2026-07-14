const fs = require('fs');

const SB_URL = 'https://yyhnnalsqzyghjqtfisy.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5aG5uYWxzcXp5Z2hqcXRmaXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDE4NzksImV4cCI6MjA4OTQxNzg3OX0.misOc3tEQD0GBOsjNkv6Im8wUmlfXhiX97DflpgaqAc';

const src = fs.readFileSync('scratchpad/crm-prospects-final.js', 'utf8');
const leads = new Function(src + '\nreturn CRM_RESEARCHED_LEADS;')();

const nowIso = new Date().toISOString();
const rows = leads.map(lead => ({
  id:          lead.id,
  company:     lead.company || '',
  contact:     lead.contact || '',
  phone:       lead.phone || '',
  email:       lead.email || '',
  state:       lead.state || '',
  street:      lead.street || '',
  city:        lead.city || '',
  zip:         lead.zip || '',
  exit:        lead.exit || '',
  lanes:       lead.lanes || '',
  stage:       lead.stage || 'Prospect',
  priority:    lead.priority || 'Medium',
  owner:       lead.owner || '',
  source:      lead.source || '',
  locations:   lead.locations || 1,
  est_gallons: lead.estGallons || 0,
  deal_value:  lead.dealValue || 0,
  follow_up:   lead.followUp || '',
  notes:       lead.notes || '',
  activity:    lead.activity || [],
  updated_at:  nowIso,
}));

async function main() {
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(SB_URL + '/rest/v1/crm_leads?on_conflict=id', {
      method: 'POST',
      headers: {
        'apikey': SB_ANON,
        'Authorization': 'Bearer ' + SB_ANON,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('batch ' + (i / BATCH + 1) + ' failed: HTTP ' + res.status + ' ' + text);
    }
    inserted += batch.length;
    console.log('batch', Math.ceil((i + batch.length) / BATCH), 'of', Math.ceil(rows.length / BATCH), '— sent', inserted, '/', rows.length);
  }
  console.log('done, sent', inserted, 'rows total');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
