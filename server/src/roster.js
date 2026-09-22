// Turns a Google Form "Responses" export (CSV, or a published-to-web CSV link) into roster rows.
// Column headers vary per form, so we match them loosely rather than requiring an exact name.
const { normEmail } = require('./util');

// Minimal CSV parser: handles quoted fields, embedded commas, escaped quotes and CRLF —
// everything Google Sheets' CSV export produces. No external dependency needed.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Header matching: first header whose lowercased text contains one of the given hints wins.
// `used` tracks columns already claimed by an earlier (more specific) field, so one column in
// an unusually-worded form (e.g. a header that happens to contain both "register" and "email")
// can't be claimed by two different fields at once.
function findColumn(headers, hints, used) {
  const lower = headers.map((h) => String(h || '').toLowerCase());
  for (const hint of hints) {
    const i = lower.findIndex((h, idx) => h.includes(hint) && !used.has(idx));
    if (i !== -1) { used.add(i); return i; }
  }
  return -1;
}

const YEAR_HINTS = {
  '1st': ['1', 'first', 'i year', 'i-year'],
  '2nd': ['2', 'second', 'ii year', 'ii-year'],
};
function normYear(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  if (/^1|first|^i\b/.test(v)) return '1st';
  if (/^2|second|^ii\b/.test(v)) return '2nd';
  return null;
}

// Returns { rows: [{name, year, dept, email, phone, regNo, slot}], errors: [string] }
// Only rows with a valid email and a year of 1st or 2nd are kept; everything else is reported.
function parseRoster(csvText) {
  const table = parseCSV(csvText);
  if (!table.length) return { rows: [], errors: ['The file has no rows.'] };
  const headers = table[0];
  // The Google Form export can have these columns in any order ("name, emailid, register, dept,
  // slot, phone number, year" or any other arrangement) - matching is entirely by header text,
  // never by position, so column order in the sheet never matters. Resolved most-specific-first
  // (email, year, phone, register number, slot, department) so a column can't be double-claimed;
  // "name" is resolved last because it's the broadest hint and could otherwise grab the wrong column.
  const used = new Set();
  const col = {
    email: findColumn(headers, ['email', 'e-mail', 'mail'], used),
    year: findColumn(headers, ['year'], used),
    phone: findColumn(headers, ['phone', 'mobile', 'contact', 'whatsapp'], used),
    regNo: findColumn(headers, ['register', 'roll', 'reg no', 'reg. no', 'id number', 'admission'], used),
    slot: findColumn(headers, ['slot', 'batch', 'session', 'time slot'], used),
    dept: findColumn(headers, ['dept', 'department', 'branch'], used),
    name: findColumn(headers, ['name'], used),
  };
  if (col.email === -1) return { rows: [], errors: ['No email column found. The sheet needs a column with "email" in its header.'] };

  const rows = [];
  const errors = [];
  const seen = new Set();
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const get = (idx) => (idx === -1 ? '' : String(r[idx] || '').trim());
    const email = normEmail(get(col.email));
    const rowLabel = `Row ${i + 1}`;
    if (!email || !email.includes('@')) { errors.push(`${rowLabel}: missing or invalid email, skipped.`); continue; }
    const year = col.year === -1 ? null : normYear(get(col.year));
    if (!year) { errors.push(`${rowLabel} (${email}): year is not 1st or 2nd, skipped.`); continue; }
    if (seen.has(email)) { errors.push(`${rowLabel} (${email}): duplicate email in this file, skipped.`); continue; }
    seen.add(email);
    rows.push({
      name: get(col.name) || email.split('@')[0],
      year,
      dept: get(col.dept),
      email,
      phone: get(col.phone),
      regNo: get(col.regNo),
      slot: get(col.slot),
    });
  }
  return { rows, errors };
}

module.exports = { parseCSV, parseRoster };
