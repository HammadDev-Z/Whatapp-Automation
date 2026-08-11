'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { requireAuth, ensureCsrf, verifyCsrf, safeEqual } = require('../middleware/security');
const { escapeHtml, layout } = require('../utilities/html');
const { maskCode } = require('../utilities/mask');
const { importCodeLines } = require('../services/code-importer');
const { AdminRepository } = require('../services/admin-repository');
const { UsageReportingService } = require('../services/usage-reporting');

function table(headers, rows, className = '') {
  return `<div class="table-wrap ${escapeHtml(className)}"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headers.length}" class="empty-state">No records found</td></tr>`}</tbody></table></div>`;
}

function badge(value, kind = '') {
  return `<span class="badge ${escapeHtml(kind || String(value || '').toLowerCase())}">${escapeHtml(value || '—')}</span>`;
}

const PAKISTAN_TIMEZONE = 'Asia/Karachi';

function timestamp(value) {
  if (!value) return '<span class="muted">—</span>';
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: PAKISTAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return escapeHtml(formatter.format(value).replace(',', ''));
}

function pageNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function pagination(path, query, page, hasNext) {
  const links = [];
  if (page > 1) links.push(`<a class="button secondary" href="${path}?${new URLSearchParams({ ...query, page: String(page - 1) })}">← Newer blocks</a>`);
  if (hasNext) links.push(`<a class="button secondary" href="${path}?${new URLSearchParams({ ...query, page: String(page + 1) })}">Older blocks →</a>`);
  return links.length ? `<nav class="pagination" aria-label="Pagination">${links.join('')}</nav>` : '';
}

const CATEGORY_ORDER_EXPRESSION = `
  CASE category
    WHEN '830' THEN 1
    WHEN '2320' THEN 2
    WHEN '5150' THEN 3
    WHEN '13k' THEN 4
    WHEN '27k' THEN 5
    WHEN '56k' THEN 6
    WHEN '68k' THEN 7
    WHEN '224k' THEN 8
    WHEN '1.4m' THEN 9
    ELSE 999
  END`;

const CATEGORY_ORDER_EXPRESSION_CC = `
  CASE cc.category
    WHEN '830' THEN 1
    WHEN '2320' THEN 2
    WHEN '5150' THEN 3
    WHEN '13k' THEN 4
    WHEN '27k' THEN 5
    WHEN '56k' THEN 6
    WHEN '68k' THEN 7
    WHEN '224k' THEN 8
    WHEN '1.4m' THEN 9
    ELSE 999
  END`;

async function activeCategories(pool) {
  return (await pool.query(`SELECT category,display_name FROM code_categories WHERE active=TRUE ORDER BY ${CATEGORY_ORDER_EXPRESSION}`)).rows;
}

function createDashboardRouter({ pool, config }) {
  const router = express.Router();
  const adminRepository = new AdminRepository(pool);
  const usageReporting = new UsageReportingService(pool);
  router.use(ensureCsrf);

  router.get('/login', (req, res) => res.send(layout('Login', `<section class="card narrow login-card"><div class="eyebrow">SECURE NODE ACCESS</div><h1>Administrator login</h1><p class="muted">Authenticate to manage inventory and inspect the immutable event ledger.</p><form method="post" action="/login"><input type="hidden" name="_csrf" value="${req.session.csrfToken}"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button>Connect to dashboard</button></form></section>`)));
  router.post('/login', verifyCsrf, (req, res) => {
    if (safeEqual(req.body.username, config.adminUsername) && safeEqual(req.body.password, config.adminPassword)) {
      req.session.regenerate((error) => {
        if (error) return res.status(500).send('Login failed');
        req.session.authenticated = true;
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        res.redirect('/dashboard');
      });
    } else res.status(401).send(layout('Login', '<section class="card narrow"><h1>Login failed</h1><p class="muted">The supplied credentials were not accepted.</p><a class="button" href="/login">Try again</a></section>'));
  });
  router.post('/logout', requireAuth, verifyCsrf, (req, res) => req.session.destroy(() => res.redirect('/login')));
  router.use('/dashboard', requireAuth);

  router.get('/dashboard', async (req, res, next) => {
    try {
      const categories = await activeCategories(pool);
      const inventory = await usageReporting.inventory();
      const resetAt = await usageReporting.getResetAt();
      const totals = inventory.reduce((result, row) => ({
        unused: result.unused + row.unused,
        used: result.used + row.used,
        failed: result.failed + row.failed
      }), { unused: 0, used: 0, failed: 0 });
      const recent = [];
      const inventoryRows = inventory.map((row) => `<tr><td><span class="category-token">${escapeHtml(row.display_name)}</span></td><td class="metric positive">${row.unused}</td><td class="metric">${row.used}</td><td class="metric ${row.failed ? 'negative' : ''}">${row.failed}</td><td>${row.unused + row.used}</td></tr>`);
      const recentBlocks = recent.map((event) => `<article class="ledger-block"><div class="block-index">BLOCK #${event.id}</div><div><strong>${escapeHtml(event.action.replaceAll('_', ' '))}</strong><small>${timestamp(event.created_at)} · ${escapeHtml(event.category || 'system')}</small></div><div>${escapeHtml(maskCode(event.code))}</div><div>${badge(event.delivery_status || 'recorded')}</div></article>`).join('') || '<p class="empty-state">The ledger has no events yet.</p>';
      const options = categories.map((item) => `<option value="${escapeHtml(item.category)}">${escapeHtml(item.display_name)}</option>`).join('');
      const content = `
        <section class="hero"><div><div class="eyebrow">LIVE DISTRIBUTION NODE</div><h1>Code inventory</h1><p>Manage stock and trace every code from import to WhatsApp delivery.</p></div><div class="node-status"><span></span> DATABASE ONLINE</div></section>
        <section class="stats-grid"><article><span>Available supply</span><strong>${totals.unused}</strong><small>Ready to issue</small></article><article><span>Codes consumed</span><strong>${totals.used}</strong><small>Recorded on ledger</small></article><article><span>Delivery alerts</span><strong>${totals.failed}</strong><small>Require review</small></article><article><span>Active categories</span><strong>${categories.length}</strong><small>Configured networks</small></article></section>
        <section class="dashboard-grid"><section class="panel inventory-panel"><div class="section-heading"><div><div class="eyebrow">SUPPLY BY NETWORK</div><h2>Inventory matrix</h2></div><a href="/dashboard/codes">View code lifecycle →</a></div>${table(['Category','Available','Used','Failed','Total'], inventoryRows)}</section><aside class="panel import-panel"><div class="eyebrow">MINT INVENTORY</div><h2>Add multiple codes</h2><p class="muted">Choose one category, then paste one code per line. Numbered lists are accepted automatically.</p><form method="post" action="/dashboard/import"><input type="hidden" name="_csrf" value="${req.session.csrfToken}"><label>Code category<select name="category" required>${options}</select></label><label>Codes<textarea name="codes" rows="14" required spellcheck="false" placeholder="code1&#10;code2&#10;code3"></textarea></label><button type="submit">Add codes to inventory</button><small>Duplicate codes are skipped. Complete code values never appear in dashboard history.</small></form></aside><section class="panel history-panel"><div class="section-heading"><div><div class="eyebrow">LATEST BLOCKS</div><h2>Recent ledger activity</h2></div><a href="/dashboard/audit">Open full ledger →</a></div><div class="ledger-chain">${recentBlocks}</div></section></section>`;
      const reportingContent = `
        <section class="hero"><div><div class="eyebrow">LIVE DISTRIBUTION NODE</div><h1>Code inventory</h1><p>Manage stock and monitor usage since the latest reporting reset.</p></div><div class="node-status"><span></span> DATABASE ONLINE</div></section>
        <section class="stats-grid"><article><span>Available supply</span><strong>${totals.unused}</strong><small>Ready to issue</small></article><article><span>Codes consumed</span><strong>${totals.used}</strong><small>Since reporting reset</small></article><article><span>Delivery alerts</span><strong>${totals.failed}</strong><small>Require review</small></article><article><span>Active categories</span><strong>${categories.length}</strong><small>Configured networks</small></article></section>
        <section class="reset-panel panel"><div><div class="eyebrow">REPORTING BASELINE</div><h2>Usage counters</h2><p class="muted">Counters started ${timestamp(resetAt)}. Resetting never returns issued codes to inventory.</p></div><form method="post" action="/dashboard/usage/reset"><input type="hidden" name="_csrf" value="${req.session.csrfToken}"><button class="danger" type="submit">Reset all usage counters</button></form></section>
        <section class="dashboard-grid"><section class="panel inventory-panel"><div class="section-heading"><div><div class="eyebrow">SUPPLY BY NETWORK</div><h2>Inventory matrix</h2></div><a href="/dashboard/codes">View code lifecycle</a></div>${table(['Category','Available','Used','Failed','Total'], inventoryRows)}</section><aside class="panel import-panel"><div class="eyebrow">MINT INVENTORY</div><h2>Add multiple codes</h2><p class="muted">Choose one category, then paste one code per line. Numbered lists are accepted automatically.</p><form method="post" action="/dashboard/import"><input type="hidden" name="_csrf" value="${req.session.csrfToken}"><label>Code category<select name="category" required>${options}</select></label><label>Codes<textarea name="codes" rows="14" required spellcheck="false" placeholder="code1&#10;code2&#10;code3"></textarea></label><button type="submit">Add codes to inventory</button><small>Duplicate codes are skipped. Complete code values never appear in dashboard history.</small></form></aside></section>`;
      res.send(layout('Inventory', reportingContent, req.session.csrfToken));
    } catch (error) { next(error); }
  });

  router.post('/dashboard/usage/reset', verifyCsrf, async (_req, res, next) => {
    try {
      await usageReporting.reset();
      res.redirect('/dashboard');
    } catch (error) { next(error); }
  });

  router.post('/dashboard/import', verifyCsrf, async (req, res, next) => {
    try {
      const result = await importCodeLines(pool, req.body.category, req.body.codes);
      const errorSummary = result.errors.length ? `<details><summary>${result.errors.length} invalid line(s)</summary><ul>${result.errors.slice(0, 20).map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></details>` : '';
      res.send(layout('Import result', `<section class="card result-card"><div class="success-icon">✓</div><div class="eyebrow">BLOCK COMMITTED</div><h1>Inventory updated</h1><p>Category <span class="category-token">${escapeHtml(result.category)}</span></p><div class="result-grid"><div><strong>${result.imported}</strong><span>Imported</span></div><div><strong>${result.skipped}</strong><span>Duplicates skipped</span></div><div><strong>${result.failed}</strong><span>Invalid</span></div></div>${errorSummary}<a class="button" href="/dashboard">Return to inventory</a><a class="button secondary" href="/dashboard/audit">View ledger</a></section>`, req.session.csrfToken));
    } catch (error) {
      if (/category|code|line/i.test(error.message)) return res.status(400).send(layout('Import failed', `<section class="card narrow"><h1>Nothing was imported</h1><p>${escapeHtml(error.message)}</p><a class="button" href="/dashboard">Return to inventory</a></section>`, req.session.csrfToken));
      next(error);
    }
  });

  router.get('/dashboard/codes', async (req, res, next) => {
    try {
      const page = pageNumber(req.query.page);
      const limit = 100;
      const where = [];
      const values = [];
      if (req.query.category) { values.push(req.query.category); where.push(`c.category=$${values.length}`); }
      if (['unused', 'used', 'reserved'].includes(req.query.status)) { values.push(req.query.status); where.push(`c.status=$${values.length}`); }
      values.push(limit + 1, (page - 1) * limit);
      const records = (await pool.query(
        `SELECT c.id,c.category,c.code,c.status,c.delivery_status,c.created_at,c.used_at,c.used_by_group,c.requested_by,c.request_message_id,g.group_name
         FROM codes c LEFT JOIN allowed_groups g ON g.group_id=c.used_by_group
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY c.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      )).rows;
      const hasNext = records.length > limit;
      const rows = records.slice(0, limit).map((code) => `<tr><td class="block-number">#${code.id}</td><td>${escapeHtml(maskCode(code.code))}</td><td>${escapeHtml(code.category)}</td><td>${badge(code.status)}</td><td>${badge(code.delivery_status || 'not sent')}</td><td>${timestamp(code.created_at)}</td><td>${timestamp(code.used_at)}</td><td>${escapeHtml(code.group_name || code.used_by_group || '—')}</td><td>${escapeHtml(code.requested_by || '—')}</td></tr>`);
      const categories = await activeCategories(pool);
      const options = categories.map((item) => `<option value="${escapeHtml(item.category)}" ${req.query.category === item.category ? 'selected' : ''}>${escapeHtml(item.display_name)}</option>`).join('');
      const filters = `<form class="filters"><label>Category<select name="category"><option value="">All categories</option>${options}</select></label><label>Status<select name="status"><option value="">All statuses</option>${['unused','used','reserved'].map((status) => `<option value="${status}" ${req.query.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><button>Filter lifecycle</button><a class="button secondary" href="/dashboard/codes">Clear</a></form>`;
      res.send(layout('Code lifecycle', `<section class="hero compact"><div><div class="eyebrow">ASSET REGISTRY</div><h1>Code lifecycle</h1><p>Masked inventory records with creation, usage, requester, group, and delivery state.</p></div></section>${filters}${table(['Record','Masked code','Category','Status','Delivery','Created UTC','Used UTC','Group','Requester'], rows, 'ledger-table')}${pagination('/dashboard/codes', { category: req.query.category || '', status: req.query.status || '' }, page, hasNext)}`, req.session.csrfToken));
    } catch (error) { next(error); }
  });

  router.get('/dashboard/groups', async (req, res, next) => {
    try {
      const groups = (await pool.query('SELECT * FROM allowed_groups ORDER BY group_name')).rows;
      const rows = groups.map((group) => `<tr><td>${escapeHtml(group.group_name)}</td><td><code>${escapeHtml(group.group_id)}</code></td><td>${badge(group.active ? 'active' : 'disabled')}</td><td><form method="post" action="/dashboard/groups/toggle"><input type="hidden" name="_csrf" value="${req.session.csrfToken}"><input type="hidden" name="group_id" value="${escapeHtml(group.group_id)}"><input type="hidden" name="active" value="${group.active ? 'false' : 'true'}"><button class="small-button ${group.active ? 'danger' : ''}">${group.active ? 'Disable' : 'Enable'}</button></form></td></tr>`);
      const addGroupForm = `
        <section id="group-add" class="card narrow group-add-card">
          <div class="eyebrow">REGISTER GROUP</div>
          <h2>Add a new authorized group</h2>
          <p class="muted">Enter the WhatsApp group ID and a display name. The group will be enabled automatically.</p>
          <form method="post" action="/dashboard/groups/add">
            <input type="hidden" name="_csrf" value="${req.session.csrfToken}">
            <label>Group name<input name="group_name" required maxlength="100" placeholder="Customer group"></label>
            <label>Group ID<input name="group_id" required maxlength="200" placeholder="120363...@g.us"></label>
            <button type="submit">Add group</button>
          </form>
        </section>
      `;
      res.send(layout('Groups', `<section class="hero compact"><div><div class="eyebrow">ACCESS CONTROL</div><h1>Authorized groups</h1><p>Only active groups can consume inventory.</p></div><a href="#group-add" class="button">Add group</a></section>${addGroupForm}${table(['Name','Group ID','State','Action'], rows)}`, req.session.csrfToken));
    } catch (error) { next(error); }
  });

  router.get('/dashboard/admins', async (req, res, next) => {
    try {
      const admins = await adminRepository.list();
      const rows = admins.map((admin) => `<tr><td>${escapeHtml(admin.display_name || '—')}</td><td><code>${escapeHtml(admin.phone)}</code></td><td>${timestamp(admin.created_at)}</td><td>${timestamp(admin.updated_at)}</td><td><form method="post" action="/dashboard/admins/delete"><input type="hidden" name="_csrf" value="${req.session.csrfToken}"><input type="hidden" name="phone" value="${escapeHtml(admin.phone)}"><button class="small-button danger">Delete</button></form></td></tr>`);
      const form = `
        <section class="card narrow admin-add-card">
          <div class="eyebrow">ADMIN NUMBERS</div>
          <h2>Add administrator</h2>
          <p class="muted">Enter a WhatsApp admin phone number and optional label. This list controls /status, /stock, and /groupid access.</p>
          <form method="post" action="/dashboard/admins/add">
            <input type="hidden" name="_csrf" value="${req.session.csrfToken}">
            <label>Display name<input name="display_name" maxlength="100" placeholder="Administrator"></label>
            <label>Phone number<input name="phone" required maxlength="20" placeholder="923001234567"></label>
            <button type="submit">Save admin</button>
          </form>
        </section>
      `;
      res.send(layout('Admin numbers', `<section class="hero compact"><div><div class="eyebrow">ADMIN CONTROL</div><h1>Administrator numbers</h1><p>Manage WhatsApp admin access from the dashboard.</p></div><a href="#admin-add" class="button">Add admin</a></section><section id="admin-add">${form}</section>${table(['Name','Phone','Created','Updated','Action'], rows)}`, req.session.csrfToken));
    } catch (error) { next(error); }
  });

  router.post('/dashboard/admins/add', verifyCsrf, async (req, res, next) => {
    try {
      const displayName = String(req.body.display_name || '').trim();
      const phone = String(req.body.phone || '').trim();
      if (!phone) return res.status(400).send(layout('Invalid admin', `<section class="card narrow"><h1>Phone number is required</h1><a class="button" href="/dashboard/admins">Return</a></section>`, req.session.csrfToken));
      await adminRepository.set(phone, displayName);
      res.redirect('/dashboard/admins');
    } catch (error) { next(error); }
  });

  router.post('/dashboard/admins/delete', verifyCsrf, async (req, res, next) => {
    try {
      await adminRepository.delete(req.body.phone);
      res.redirect('/dashboard/admins');
    } catch (error) { next(error); }
  });

  router.post('/dashboard/groups/add', verifyCsrf, async (req, res, next) => {
    try {
      const groupId = String(req.body.group_id || '').trim();
      const groupName = String(req.body.group_name || '').trim();
      if (!groupId || !groupName) return res.status(400).send(layout('Group add failed', `<section class="card narrow"><h1>Invalid group details</h1><p class="muted">Both group ID and name are required.</p><a class="button" href="/dashboard/groups">Return to groups</a></section>`, req.session.csrfToken));
      await pool.query(
        `INSERT INTO allowed_groups(group_id,group_name,active) VALUES($1,$2,TRUE)
         ON CONFLICT(group_id) DO UPDATE SET group_name=EXCLUDED.group_name,active=TRUE,updated_at=NOW()`,
        [groupId, groupName]
      );
      await pool.query('INSERT INTO audit_logs(action,group_id) VALUES($1,$2)', ['group_registered', groupId]);
      res.redirect('/dashboard/groups');
    } catch (error) { next(error); }
  });

  router.post('/dashboard/groups/toggle', verifyCsrf, async (req, res, next) => {
    try {
      const active = req.body.active === 'true';
      const updated = await pool.query('UPDATE allowed_groups SET active=$2,updated_at=NOW() WHERE group_id=$1 RETURNING group_id', [req.body.group_id, active]);
      if (updated.rowCount) await pool.query('INSERT INTO audit_logs(action,group_id) VALUES($1,$2)', [active ? 'group_enabled' : 'group_disabled', req.body.group_id]);
      res.redirect('/dashboard/groups');
    } catch (error) { next(error); }
  });

  router.get('/dashboard/audit', async (req, res, next) => {
    try {
      const groups = await usageReporting.listGroups();
      const requestedGroupId = String(req.query.group || '').trim();
      const selectedGroup = groups.find((group) => group.group_id === requestedGroupId) || null;
      const resetAt = await usageReporting.getResetAt();
      const options = groups.map((group) => `<option value="${escapeHtml(group.group_id)}" ${selectedGroup?.group_id === group.group_id ? 'selected' : ''}>${escapeHtml(group.group_name)}${group.active ? '' : ' (disabled)'}</option>`).join('');
      let summary = '<section class="panel"><p class="empty-state">Select a group to view its code usage since the latest reset.</p></section>';
      if (selectedGroup) {
        const usage = await usageReporting.groupUsage(selectedGroup.group_id);
        const total = usage.reduce((sum, row) => sum + Number(row.used), 0);
        const rows = usage.map((row) => `<tr><td><span class="category-token">${escapeHtml(row.display_name)}</span></td><td class="metric">${row.used}</td></tr>`);
        summary = `<section class="panel"><div class="section-heading"><div><div class="eyebrow">GROUP USAGE</div><h2>${escapeHtml(selectedGroup.group_name)}</h2></div><strong>${total} codes requested</strong></div>${table(['Category','Codes requested'], rows)}<p class="muted">Usage counted since ${timestamp(resetAt)}.</p></section>`;
      }
      const selector = `<form class="filters" method="get" action="/dashboard/audit"><label>WhatsApp group<select name="group" required><option value="">Select a group</option>${options}</select></label><button type="submit">Show group usage</button></form>`;
      res.send(layout('Group usage', `<section class="hero compact"><div><div class="eyebrow">USAGE REPORT</div><h1>Group code usage</h1><p>Select a WhatsApp group to see how many codes it requested after the latest dashboard reset.</p></div></section>${selector}${summary}`, req.session.csrfToken));
    } catch (error) { next(error); }
  });

  const LEDGER_PERIODS = {
    today: { label: 'Today', sql: `used_at AT TIME ZONE 'Asia/Karachi' >= timezone('Asia/Karachi', NOW()) - interval '1 day'` },
    week: { label: '1 week', sql: `used_at AT TIME ZONE 'Asia/Karachi' >= timezone('Asia/Karachi', NOW()) - interval '7 days'` },
    month: { label: '1 month', sql: `used_at AT TIME ZONE 'Asia/Karachi' >= timezone('Asia/Karachi', NOW()) - interval '30 days'` }
  };

  router.get('/dashboard/audit', async (req, res, next) => {
    try {
      const page = pageNumber(req.query.page);
      const limit = 100;
      const where = [];
      const values = [];
      for (const [key, column] of [['category', 'a.category'], ['group', 'a.group_id'], ['action', 'a.action']]) {
        if (req.query[key]) { values.push(req.query[key]); where.push(`${column}=$${values.length}`); }
      }
      if (req.query.date) {
        values.push(req.query.date);
        where.push(`a.created_at AT TIME ZONE 'Asia/Karachi' >= $${values.length}::date AND a.created_at AT TIME ZONE 'Asia/Karachi' < $${values.length}::date + interval '1 day'`);
      }
      values.push(limit + 1, (page - 1) * limit);
      const records = (await pool.query(
        `SELECT a.*,c.code,g.group_name FROM audit_logs a
         LEFT JOIN codes c ON c.id=a.code_id LEFT JOIN allowed_groups g ON g.group_id=a.group_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY a.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      )).rows;
      const hasNext = records.length > limit;
      const rows = records.slice(0, limit).map((event) => `<tr><td class="block-number">#${event.id}</td><td>${timestamp(event.created_at)}</td><td>${escapeHtml(event.action)}</td><td>${escapeHtml(event.category || '—')}</td><td>${escapeHtml(maskCode(event.code))}</td><td>${escapeHtml(event.group_name || event.group_id || '—')}</td><td>${escapeHtml(event.requested_by || '—')}</td><td>${badge(event.delivery_status || 'recorded')}</td><td><code>${escapeHtml(event.whatsapp_message_id || '—')}</code></td><td>${escapeHtml(event.error_message || '—')}</td></tr>`);
      const selectedPeriod = String(req.query.period || '').trim();
      const selectedDefinition = LEDGER_PERIODS[selectedPeriod];
      let periodSummary = '';
      if (selectedDefinition) {
        const summary = await pool.query(
          `SELECT category, count(*)::int AS used_count
           FROM codes
           WHERE status='used' AND ${selectedDefinition.sql}
           GROUP BY category
           ORDER BY ${CATEGORY_ORDER_EXPRESSION}`
        );
        const summaryRows = summary.rows.map((row) => `<li>${escapeHtml(row.category)} ${row.used_count} used</li>`).join('') || '<li>No used codes in this period</li>';
        periodSummary = `<section class="panel period-summary"><div class="section-heading"><div><div class="eyebrow">${escapeHtml(selectedDefinition.label)} usage</div><h2>Category usage summary</h2></div></div><ul class="usage-summary">${summaryRows}</ul></section>`;
      }
      const periodButtons = Object.entries(LEDGER_PERIODS).map(([key, definition]) => `<a class="button${selectedPeriod === key ? '' : ' secondary'}" href="/dashboard/audit?${new URLSearchParams({ ...req.query, period: key, page: '1' })}">${escapeHtml(definition.label)}</a>`).join('');
      const filters = `<form class="filters ledger-filters"><label>Category<input name="category" placeholder="e.g. 830" value="${escapeHtml(req.query.category)}"></label><label>Group ID<input name="group" placeholder="120…@g.us" value="${escapeHtml(req.query.group)}"></label><label>Event<input name="action" placeholder="delivered" value="${escapeHtml(req.query.action)}"></label><label>PKT date<input type="date" name="date" value="${escapeHtml(req.query.date)}"></label><button>Search ledger</button><a class="button secondary" href="/dashboard/audit">Clear</a></form>`;
      const query = { category: req.query.category || '', group: req.query.group || '', action: req.query.action || '', date: req.query.date || '' };
      res.send(layout('Event ledger', `<section class="hero compact"><div><div class="eyebrow">AUDIT CHAIN</div><h1>Complete event ledger</h1><p>Every recorded import, allocation, delivery outcome, stock event, and group-access change.</p></div></section><div class="period-buttons">${periodButtons}</div>${periodSummary}${filters}${table(['Block','PKT timestamp','Event','Category','Masked code','Group','Requester','Delivery','Message ID','Details'], rows, 'ledger-table')}${pagination('/dashboard/audit', query, page, hasNext)}`, req.session.csrfToken));
    } catch (error) { next(error); }
  });

  router.get('/dashboard/failed', async (req, res, next) => {
    try {
      const records = (await pool.query("SELECT id,category,code,used_by_group,requested_by,used_at FROM codes WHERE delivery_status='failed' ORDER BY used_at DESC")).rows;
      const rows = records.map((code) => `<tr><td class="block-number">#${code.id}</td><td>${escapeHtml(code.category)}</td><td>${escapeHtml(maskCode(code.code))}</td><td>${escapeHtml(code.used_by_group)}</td><td>${escapeHtml(code.requested_by)}</td><td>${timestamp(code.used_at)}</td></tr>`);
      res.send(layout('Delivery alerts', `<section class="hero compact"><div><div class="eyebrow">EXCEPTION QUEUE</div><h1>Failed deliveries</h1><p>These codes remain marked as used and require manual review.</p></div></section>${table(['Record','Category','Masked code','Group','Requester','UTC timestamp'], rows)}`, req.session.csrfToken));
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createDashboardRouter };
