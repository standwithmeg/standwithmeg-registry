/* Stand With Meg sponsor admin.
   Tracks remote partner submissions/prospects plus local Square payment ledger.
   It does not move money or store sensitive bank/tax data. */

(function () {
  var SESSION_KEY = 'swm_admin_session';
  var SESSION_CODE_KEY = 'swm_admin_session_code';
  var STORE_KEY = 'swm_sponsor_admin_records_v1';
  var REMOTE_ENDPOINT = '/api/partner-portal/submissions';
  var root = document.getElementById('admin-root');
  var toastEl = document.getElementById('toast');
  var remoteState = { loaded: false, loading: false, error: '', records: [] };
  var activeView = (window.location.hash || '#inquiries').replace('#', '') || 'inquiries';
  var VIEWS = ['inquiries', 'overview', 'prospects', 'submissions', 'sponsors', 'payouts'];
  var VIEW_LABELS = {
    inquiries: 'Inquiries',
    overview: 'Overview',
    prospects: 'Prospects',
    submissions: 'Submissions',
    sponsors: 'Sponsors',
    payouts: 'Payouts'
  };

  // Sponsor inquiries inbox state — keeps the Supabase inbox always current.
  var POLL_MS = 60000;
  var pollTimer = null;
  var pollBound = false;
  var lastSyncedAt = null;
  var seenInquiryIds = null;     // null until the first successful load this session
  var newInquiryIds = {};        // ids that arrived via a background refresh
  var inquiryFilter = 'all';     // all | new | contacted | won | passed
  var inquiryQuery = '';
  var INQUIRY_SOURCE = 'sponsor_inquiries';
  var INQUIRY_STATUSES = ['new', 'contacted', 'won', 'passed'];

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(dateString, days) {
    var d = dateString ? new Date(dateString + 'T12:00:00') : new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function money(n) {
    var value = Number(n || 0);
    return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: value % 1 ? 2 : 0 });
  }

  function uid() {
    return 'sponsor_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('is-show'); }, 2400);
  }

  function isAuthed() {
    try { return sessionStorage.getItem(SESSION_KEY) === 'yes'; } catch (e) { return false; }
  }

  function adminCode() {
    try { return sessionStorage.getItem(SESSION_CODE_KEY) || ''; } catch (e) { return ''; }
  }

  function loadRecords() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecords(records) {
    localStorage.setItem(STORE_KEY, JSON.stringify(records));
  }

  function normalizeRecord(record) {
    var monthly = Number(record.monthlyAmount || 0);
    var owner = record.saleOwner || (record.partnerName || record.partnerEmail ? 'partner' : 'meg');
    // Base partner rate is 20% (25% only after 15+ active accounts — set per record).
    var rate = owner === 'meg' ? 0 : Number(record.commissionRate || 20);
    var commission = owner === 'meg' ? 0 : monthly * (rate / 100);
    return Object.assign({
      id: uid(),
      sponsorName: '',
      displayName: '',
      state: '',
      tier: 'State Exclusive',
      monthlyAmount: 0,
      saleOwner: 'partner',
      partnerName: '',
      partnerEmail: '',
      commissionRate: 20,
      sponsorStatus: 'onboarding',
      sponsorPaymentStatus: 'due',
      lastSponsorPayment: '',
      nextSponsorPayment: today(),
      commissionStatus: 'hold',
      lastCommissionPaid: '',
      sponsorWebsiteUrl: '',
      squareCustomerUrl: '',
      squareContractUrl: '',
      squareSubscriptionUrl: '',
      logoFileName: '',
      adWording: '',
      publicContactLine: '',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, record, {
      saleOwner: owner,
      commissionRate: rate,
      commissionDue: commission
    });
  }

  function records() {
    return loadRecords().map(normalizeRecord);
  }

  function setRecords(next) {
    saveRecords(next.map(function (record) {
      var copy = Object.assign({}, record);
      delete copy.commissionDue;
      copy.updatedAt = new Date().toISOString();
      return copy;
    }));
  }

  function normalizeRemote(record) {
    return Object.assign({
      id: '',
      record_type: 'prospect',
      status: 'new',
      business_name: '',
      display_name: '',
      contact_name: '',
      contact_email: '',
      phone: '',
      website: '',
      partner_name: '',
      partner_email: '',
      partner_state: '',
      requested_tier: '',
      quoted_price: '',
      state_placement: '',
      law_firm_status: '',
      logo_status: '',
      logo_file_name: '',
      logo_link_notes: '',
      ad_wording: '',
      public_contact_line: '',
      business_description: '',
      conversation_notes: '',
      prospect_stage: '',
      interest_level: '',
      best_signal: '',
      next_follow_up: '',
      created_at: '',
      source_store: ''
    }, record);
  }

  function remoteRecords() {
    return remoteState.records.map(normalizeRemote);
  }

  function statusBadge(status) {
    var cls = status === 'current' || status === 'paid' || status === 'active' || status === 'won' || status === 'approved' ? 'badge--ok'
      : status === 'due' || status === 'ready' || status === 'onboarding' || status === 'interested' || status === 'packet_sent' || status === 'submitted' || status === 'reviewing' ? 'badge--due'
      : 'badge--hold';
    return '<span class="badge ' + cls + '">' + escapeHTML(status || 'unknown') + '</span>';
  }

  function apiUrl() {
    return REMOTE_ENDPOINT + '?code=' + encodeURIComponent(adminCode());
  }

  function loadRemoteRecords(force, isPoll) {
    if (remoteState.loading || (remoteState.loaded && !force)) return;
    remoteState.loading = true;
    if (!isPoll) remoteState.error = '';
    fetch(apiUrl())
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          if (!res.ok) {
            var err = new Error(json.error || 'Remote inbox failed');
            err.code = json.code || '';
            throw err;
          }
          return json;
        });
      })
      .then(function (json) {
        var records = Array.isArray(json.records) ? json.records : [];
        trackNewInquiries(records, isPoll);
        remoteState.records = records;
        remoteState.error = '';
        remoteState.loaded = true;
        lastSyncedAt = new Date();
      })
      .catch(function (err) {
        // A failed background poll keeps the last good data on screen; only a
        // foreground load surfaces the error state.
        if (!isPoll) {
          remoteState.error = adminErrorMessage(err);
          remoteState.loaded = true;
        }
      })
      .finally(function () {
        remoteState.loading = false;
        if (!isAuthed()) return;
        if (isPoll) applyRemoteUpdateInPlace();
        else renderDashboard();
      });
  }

  // Flags inquiries that appeared since the last successful sync so Meg can spot
  // what came in while she was away.
  function trackNewInquiries(records, isPoll) {
    var ids = records
      .filter(function (r) { return r && r.source_store === INQUIRY_SOURCE; })
      .map(function (r) { return r.id; });
    if (seenInquiryIds === null) {
      seenInquiryIds = {};
      ids.forEach(function (id) { seenInquiryIds[id] = true; });
      return;
    }
    if (isPoll) {
      ids.forEach(function (id) {
        if (!seenInquiryIds[id]) newInquiryIds[id] = true;
      });
    }
    ids.forEach(function (id) { seenInquiryIds[id] = true; });
    updateBrowserBadge();
  }

  function newInquiryCount() {
    return Object.keys(newInquiryIds).length;
  }

  function clearNewInquiries() {
    newInquiryIds = {};
    updateBrowserBadge();
  }

  function updateBrowserBadge() {
    var count = newInquiryCount();
    document.title = (count ? '(' + count + ') ' : '') + 'Admin — Stand With Meg Partner Portal';
  }

  // Background polls refresh data without wiping forms or search boxes. Only the
  // inquiries list, its counts, the sync line, and tab badges are swapped.
  function applyRemoteUpdateInPlace() {
    updateNavBadges();
    if (activeView !== 'inquiries') return;
    var bannerEl = document.getElementById('inquiry-banner');
    if (bannerEl) bannerEl.innerHTML = renderRemoteState();
    var listEl = document.getElementById('inquiry-list');
    if (listEl) listEl.innerHTML = renderInquiryListBody(visibleInquiries());
    var countsEl = document.getElementById('inquiry-counts');
    if (countsEl) countsEl.innerHTML = renderInquiryFilterBody();
    var syncEl = document.getElementById('inquiry-sync');
    if (syncEl) syncEl.innerHTML = renderInquirySyncBody();
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      if (document.hidden || !isAuthed()) return;
      loadRemoteRecords(true, true);
    }, POLL_MS);
    if (!pollBound) {
      pollBound = true;
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && isAuthed()) loadRemoteRecords(true, true);
      });
    }
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function patchRemote(id, update) {
    return fetch(REMOTE_ENDPOINT, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ id: id, code: adminCode() }, update))
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          if (!res.ok) {
            var err = new Error(json.error || 'Could not update record');
            err.code = json.code || '';
            throw err;
          }
          return json.record;
        });
      })
      .then(function (record) {
        remoteState.records = remoteState.records.map(function (r) { return r.id === id ? record : r; });
        renderDashboard();
      });
  }

  function postRemote(record) {
    return fetch(REMOTE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          if (!res.ok || json.ok === false) {
            throw new Error(json.error || json.storage_error || 'Could not save prospect');
          }
          return json;
        });
      });
  }

  function adminErrorMessage(err) {
    if (err && err.code === 'admin_not_configured') {
      return 'Admin inbox is not configured yet. Add PARTNER_PORTAL_ADMIN_CODE in Vercel, redeploy, then log in with that private code.';
    }
    if (err && err.code === 'invalid_admin_code') {
      return 'That admin code was rejected by the server. Click Sign out, then log in with the exact private PARTNER_PORTAL_ADMIN_CODE value from Vercel.';
    }
    return (err && err.message) || 'Could not load remote inbox';
  }

  function renderLogin() {
    root.innerHTML =
      '<main class="admin-login">' +
        '<section class="card" aria-labelledby="admin-login-title">' +
          '<p class="eyebrow">Admin Area</p>' +
          '<h1 class="wordmark login__mark" id="admin-login-title"><span>Stand</span><span class="w-with">With</span><span>Meg</span></h1>' +
          '<p class="login__sub">Track partner prospects, sponsor submissions, Square payments, partner commissions, and daily payout confirmations.</p>' +
          '<form id="admin-login-form" novalidate>' +
            '<label class="field"><span>Admin code</span><input id="admin-code" type="password" autocomplete="off" required /></label>' +
            '<p class="login__error" id="admin-error" role="alert" aria-live="polite"></p>' +
            '<button class="btn btn--gold btn--block" type="submit">Open admin dashboard</button>' +
          '</form>' +
          '<p class="fine-print">The remote inbox validates this code on the server. Do not store bank accounts, SSNs, EIN documents, W-9 files, or card numbers here.</p>' +
        '</section>' +
      '</main>';

    document.getElementById('admin-login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = document.getElementById('admin-code').value.trim();
      if (!code) {
        document.getElementById('admin-error').textContent = 'Enter the private admin code.';
        return;
      }
      sessionStorage.setItem(SESSION_KEY, 'yes');
      sessionStorage.setItem(SESSION_CODE_KEY, code);
      renderDashboard();
    });
  }

  function statsFor(list, remote) {
    var active = list.filter(function (r) { return r.sponsorStatus === 'active'; });
    var mrr = active.reduce(function (sum, r) { return sum + Number(r.monthlyAmount || 0); }, 0);
    var ready = list.filter(function (r) { return r.commissionStatus === 'ready'; });
    var commissionDue = ready.reduce(function (sum, r) { return sum + Number(r.commissionDue || 0); }, 0);
    var openProspects = remote.filter(function (r) {
      return r.record_type === 'prospect' && ['won', 'lost', 'passed'].indexOf(r.status) === -1;
    });
    return {
      active: active.length,
      mrr: mrr,
      ready: ready.length,
      commissionDue: commissionDue,
      prospects: openProspects.length
    };
  }

  function renderDashboard() {
    var list = records();
    var remote = remoteRecords();
    var stats = statsFor(list, remote);
    if (VIEWS.indexOf(activeView) === -1) activeView = 'overview';
    root.innerHTML =
      '<div class="admin-shell">' +
        '<header class="admin-header">' +
          '<div><p class="wordmark sidebar__brand"><span>Stand</span><span class="w-with">With</span><span>Meg</span></p><p class="admin-header__meta">Sponsor admin · ' + today() + '</p></div>' +
          '<div class="admin-actions"><a class="btn btn--ghost btn--sm" href="portal.html">Partner portal</a><button class="btn btn--ghost btn--sm" id="admin-signout">Sign out</button></div>' +
        '</header>' +
        '<main class="admin-main">' +
          renderWorkspaceNav(stats, remote) +
          renderAdminView(activeView, list, remote, stats) +
        '</main>' +
      '</div>';

    bindDashboardEvents();
    loadRemoteRecords(false);
    startPolling();
  }

  function navCounts(stats, remote) {
    return {
      inquiries: remote.filter(function (r) { return r.source_store === INQUIRY_SOURCE; }).length,
      overview: '',
      prospects: stats.prospects,
      submissions: remote.filter(function (r) { return r.record_type === 'sponsor_submission'; }).length,
      sponsors: stats.active,
      payouts: stats.ready
    };
  }

  function renderWorkspaceNav(stats, remote) {
    var counts = navCounts(stats, remote);
    return '<section class="workspace-top">' +
      '<div>' +
        '<p class="eyebrow">Daily Control Panel</p>' +
        '<h1 class="admin-title">Sponsor operations</h1>' +
        '<p class="admin-sub">Sponsor inquiries from the public site land in the Inquiries inbox first. Prospects, submissions, paid sponsors, and partner payouts each have their own tab.</p>' +
      '</div>' +
      '<nav class="workspace-nav" aria-label="Sponsor admin sections">' +
        VIEWS.map(function (view) {
          return '<button class="workspace-tab ' + (activeView === view ? 'is-active' : '') + '" type="button" data-view="' + view + '">' +
            '<span>' + VIEW_LABELS[view] + '</span>' +
            (counts[view] !== '' ? '<b data-nav-count="' + view + '">' + escapeHTML(counts[view]) + '</b>' : '') +
          '</button>';
        }).join('') +
      '</nav>' +
    '</section>';
  }

  function updateNavBadges() {
    var stats = statsFor(records(), remoteRecords());
    var counts = navCounts(stats, remoteRecords());
    VIEWS.forEach(function (view) {
      if (counts[view] === '') return;
      var el = document.querySelector('[data-nav-count="' + view + '"]');
      if (el) el.textContent = String(counts[view]);
    });
  }

  function renderAdminView(view, list, remote, stats) {
    if (view === 'inquiries') return renderInquiriesView(remote);
    if (view === 'prospects') return renderProspectsView(remote);
    if (view === 'submissions') return renderSubmissionsView(remote);
    if (view === 'sponsors') return renderSponsorsView(list);
    if (view === 'payouts') return renderPayoutsView(list, remote, stats);
    return renderOverviewView(list, remote, stats);
  }

  function renderOverviewView(list, remote, stats) {
    return '<section class="workspace-grid workspace-grid--overview">' +
      '<div class="admin-panel">' +
        '<div class="stat-grid">' +
          '<div class="stat-card"><span>Open prospects</span><b>' + stats.prospects + '</b></div>' +
          '<div class="stat-card"><span>Active sponsors</span><b>' + stats.active + '</b></div>' +
          '<div class="stat-card"><span>Monthly revenue</span><b>' + money(stats.mrr) + '</b></div>' +
          '<div class="stat-card"><span>Payouts ready</span><b>' + stats.ready + '</b></div>' +
          '<div class="stat-card"><span>Commission due</span><b>' + money(stats.commissionDue) + '</b></div>' +
        '</div>' +
        '<div class="callout callout--red"><span class="callout__label">Important</span>This dashboard tracks what to pay. It does not send money. Send the partner payout in Square or your chosen payout tool, then click <strong>Mark commission paid</strong>. If the sponsor stops paying, the monthly partner commission stops.</div>' +
      '</div>' +
      '<div class="admin-panel">' +
        '<div class="section-bar"><div><h2 class="admin-section-title">Today\'s Watch List</h2><p class="fine-print">Only the work that needs attention now.</p></div></div>' +
        renderDailyList(list, remote) +
      '</div>' +
    '</section>';
  }

  /* ---- Sponsor inquiries inbox (the always-on view of the Supabase table) ---- */

  function inquiriesFromRemote() {
    return remoteRecords()
      .filter(function (r) { return r.source_store === INQUIRY_SOURCE; })
      .sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
  }

  function visibleInquiries() {
    var q = inquiryQuery.toLowerCase().trim();
    return inquiriesFromRemote().filter(function (r) {
      if (inquiryFilter !== 'all' && (r.status || 'new') !== inquiryFilter) return false;
      if (!q) return true;
      var haystack = [r.business_name, r.contact_name, r.contact_email, r.phone, r.state_placement, r.requested_tier, r.conversation_notes]
        .join(' ').toLowerCase();
      return haystack.indexOf(q) !== -1;
    });
  }

  function renderInquiriesView(remote) {
    return '<section class="workspace-grid" id="inquiries-panel">' +
      '<div class="admin-panel inbox-panel">' +
        '<div class="inbox-bar">' +
          '<div>' +
            '<h2 class="admin-section-title">Sponsor inquiries</h2>' +
            '<p class="fine-print">Every request from the public &ldquo;Become a Sponsor&rdquo; form, newest first. This list refreshes itself.</p>' +
          '</div>' +
          '<div class="inbox-bar__actions">' +
            '<span id="inquiry-sync" class="inbox-sync">' + renderInquirySyncBody() + '</span>' +
            '<button class="btn btn--ghost btn--sm" id="refresh-inquiries" type="button">Refresh now</button>' +
          '</div>' +
        '</div>' +
        '<div id="inquiry-banner">' + renderRemoteState() + '</div>' +
        '<label class="inbox-search"><span class="visually-hidden">Search inquiries</span>' +
          '<input id="inquiry-search" type="search" placeholder="Search business, contact, email, state, tier…" value="' + escapeHTML(inquiryQuery) + '" /></label>' +
        '<div id="inquiry-counts" class="inbox-filters">' + renderInquiryFilterBody() + '</div>' +
        '<div id="inquiry-list" class="inbox-list">' + renderInquiryListBody(visibleInquiries()) + '</div>' +
      '</div>' +
    '</section>';
  }

  function renderInquirySyncBody() {
    if (!remoteState.loaded && !remoteState.error) return '<span class="inbox-sync__dot is-live"></span>Syncing…';
    var newCount = newInquiryCount();
    var stamp = lastSyncedAt
      ? 'Synced ' + lastSyncedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : 'Not synced yet';
    var dot = remoteState.error ? '<span class="inbox-sync__dot is-error"></span>' : '<span class="inbox-sync__dot"></span>';
    var badge = newCount ? '<b class="inbox-sync__new">' + newCount + ' new</b>' : '';
    return dot + escapeHTML(stamp) + badge;
  }

  function renderInquiryFilterBody() {
    var all = inquiriesFromRemote();
    var counts = { all: all.length };
    INQUIRY_STATUSES.forEach(function (s) {
      counts[s] = all.filter(function (r) { return (r.status || 'new') === s; }).length;
    });
    var labels = { all: 'All', new: 'New', contacted: 'Contacted', won: 'Won', passed: 'Passed' };
    return ['all'].concat(INQUIRY_STATUSES).map(function (key) {
      return '<button type="button" class="inbox-filter ' + (inquiryFilter === key ? 'is-active' : '') + '" data-inquiry-filter="' + key + '">' +
        escapeHTML(labels[key]) + '<b>' + counts[key] + '</b></button>';
    }).join('');
  }

  function renderInquiryListBody(list) {
    if (remoteState.error && !list.length) return '';
    if (!remoteState.loaded && !list.length) return '<div class="empty">Loading inquiries…</div>';
    if (!list.length) {
      if (inquiryQuery || inquiryFilter !== 'all') {
        return '<div class="empty">No inquiries match this search or filter.</div>';
      }
      return '<div class="empty inbox-empty"><b>No sponsor inquiries yet.</b>' +
        '<span class="fine-print">When someone submits the public &ldquo;Become a Sponsor&rdquo; form, it appears here automatically.</span></div>';
    }
    return list.map(renderInquiryCard).join('');
  }

  function renderInquiryCard(r) {
    var status = r.status || 'new';
    var isNew = !!newInquiryIds[r.id];
    var emailHtml = r.contact_email
      ? '<a class="inbox-link" href="mailto:' + escapeHTML(r.contact_email) + '">' + escapeHTML(r.contact_email) + '</a>'
      : '<span class="inbox-muted">No email</span>';
    var phoneHtml = r.phone
      ? '<a class="inbox-link" href="tel:' + escapeHTML(String(r.phone).replace(/[^0-9+]/g, '')) + '">' + escapeHTML(r.phone) + '</a>'
      : '';
    return '<article class="inbox-card ' + (isNew ? 'is-new' : '') + '" data-remote-id="' + escapeHTML(r.id) + '">' +
      '<div class="inbox-card__head">' +
        '<div class="inbox-card__title">' +
          (isNew ? '<span class="inbox-new-tag">New</span>' : '') +
          '<h3>' + escapeHTML(r.business_name || 'Unnamed business') + '</h3>' +
        '</div>' +
        '<div class="inbox-card__meta">' + inquiryStatusBadge(status) +
          '<span class="inbox-time" title="' + escapeHTML(r.created_at || '') + '">' + escapeHTML(timeAgo(r.created_at)) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="inbox-contact">' +
        (r.contact_name ? '<span class="inbox-contact__name">' + escapeHTML(r.contact_name) + '</span>' : '') +
        emailHtml + phoneHtml +
        (r.state_placement ? '<span class="inbox-chip">' + escapeHTML(r.state_placement) + '</span>' : '') +
        (r.requested_tier ? '<span class="inbox-chip">' + escapeHTML(r.requested_tier) + '</span>' : '') +
      '</div>' +
      (r.conversation_notes ? '<p class="inbox-message">' + escapeHTML(r.conversation_notes) + '</p>' : '') +
      '<div class="inbox-actions">' +
        statusActionButton(status, 'contacted', 'Mark contacted') +
        statusActionButton(status, 'won', 'Won') +
        statusActionButton(status, 'passed', 'Passed') +
        (status !== 'new' ? '<button class="btn btn--ghost small-btn" data-remote-action="new">Reset to new</button>' : '') +
        '<button class="btn btn--gold small-btn" data-remote-action="convert">Add to sponsor ledger</button>' +
      '</div>' +
    '</article>';
  }

  function statusActionButton(current, action, label) {
    if (current === action) {
      return '<button class="btn btn--ghost small-btn is-current" disabled>' + escapeHTML(label) + ' ✓</button>';
    }
    var cls = action === 'passed' ? 'btn btn--ghost small-btn admin-danger' : 'btn btn--ghost small-btn';
    return '<button class="' + cls + '" data-remote-action="' + action + '">' + escapeHTML(label) + '</button>';
  }

  function inquiryStatusBadge(status) {
    var cls = status === 'won' ? 'badge--ok'
      : status === 'contacted' ? 'badge--due'
      : status === 'passed' ? 'badge--hold'
      : 'badge--new';
    return '<span class="badge ' + cls + '">' + escapeHTML(status) + '</span>';
  }

  function timeAgo(iso) {
    if (!iso) return 'unknown date';
    var then = new Date(iso);
    if (isNaN(then.getTime())) return 'unknown date';
    var seconds = Math.floor((Date.now() - then.getTime()) / 1000);
    if (seconds < 45) return 'just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + (minutes === 1 ? ' min ago' : ' mins ago');
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.floor(hours / 24);
    if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderProspectsView(remote) {
    var prospects = remote.filter(function (r) { return r.record_type === 'prospect'; });
    return '<section class="workspace-grid workspace-grid--split">' +
      '<div class="admin-panel">' +
        '<div class="section-bar"><div><h2 class="admin-section-title">Prospect Pipeline</h2><p class="fine-print">Public SQL inquiries, partner leads, and manual prospects.</p></div><button class="btn btn--ghost btn--sm" id="refresh-remote">Refresh</button></div>' +
        renderRemoteState() +
        renderProspectEntry() +
        renderPipelineSummary(prospects) +
      '</div>' +
      '<div class="admin-panel workspace-list-panel">' +
        '<div class="section-bar"><div><h2 class="admin-section-title">Prospects</h2><p class="fine-print">' + prospects.length + ' open or tracked lead' + (prospects.length === 1 ? '' : 's') + '.</p></div></div>' +
        renderRemoteList(prospects, 'No prospects saved yet.') +
      '</div>' +
    '</section>';
  }

  function renderSubmissionsView(remote) {
    var sponsorSubmissions = remote.filter(function (r) { return r.record_type === 'sponsor_submission'; });
    return '<section class="workspace-grid">' +
      '<div class="admin-panel workspace-list-panel">' +
        '<div class="section-bar"><div><h2 class="admin-section-title">Submission Inbox</h2><p class="fine-print">Partner sponsor submissions that emailed Meg and saved to the database.</p></div><button class="btn btn--ghost btn--sm" id="refresh-remote">Refresh inbox</button></div>' +
        renderRemoteState() +
        renderRemoteList(sponsorSubmissions, 'No sponsor submissions yet.') +
      '</div>' +
    '</section>';
  }

  function renderSponsorsView(list) {
    return '<section class="workspace-grid workspace-grid--sponsors">' +
      renderSponsorForm() +
      '<div class="admin-panel workspace-list-panel">' +
        '<div class="section-bar"><div><h2 class="admin-section-title">Sponsor Ledger</h2><p class="fine-print">Daily payment status, Square links, ad wording, and commissions.</p></div></div>' +
        renderToolbar() +
        '<div id="sponsor-list">' + renderSponsorList(list) + '</div>' +
      '</div>' +
    '</section>';
  }

  function renderPayoutsView(list, remote, stats) {
    var payoutList = list.filter(function (r) {
      return r.commissionStatus === 'ready' || r.sponsorPaymentStatus === 'due' || (!r.nextSponsorPayment || r.nextSponsorPayment <= today());
    });
    return '<section class="workspace-grid workspace-grid--split">' +
      '<div class="admin-panel">' +
        '<div class="section-bar"><div><h2 class="admin-section-title">Payout Control</h2><p class="fine-print">Square still sends the money. This view tells you what to check and what to mark paid.</p></div></div>' +
        '<div class="stat-grid stat-grid--compact">' +
          '<div class="stat-card"><span>Payouts ready</span><b>' + stats.ready + '</b></div>' +
          '<div class="stat-card"><span>Commission due</span><b>' + money(stats.commissionDue) + '</b></div>' +
          '<div class="stat-card"><span>Open prospects</span><b>' + stats.prospects + '</b></div>' +
        '</div>' +
        '<div class="callout callout--red"><span class="callout__label">Payment rule</span>If a sponsor stops paying, that monthly partner commission stops too. Do not mark commission paid until the sponsor payment is confirmed.</div>' +
        renderDailyList(list, remote) +
      '</div>' +
      '<div class="admin-panel workspace-list-panel">' +
        '<div class="section-bar"><div><h2 class="admin-section-title">Payment Work Queue</h2><p class="fine-print">Sponsors due for payment checks or commission actions.</p></div></div>' +
        '<div id="sponsor-list">' + renderSponsorList(payoutList) + '</div>' +
      '</div>' +
    '</section>';
  }

  function renderDailyList(list, remote) {
    var due = list.filter(function (r) {
      return r.sponsorStatus !== 'canceled' && (!r.nextSponsorPayment || r.nextSponsorPayment <= today());
    });
    var ready = list.filter(function (r) { return r.commissionStatus === 'ready'; });
    var followUps = remote.filter(function (r) {
      return r.record_type === 'prospect' && r.next_follow_up && r.next_follow_up <= today() && ['won', 'lost', 'passed'].indexOf(r.status) === -1;
    });
    var newSubmissions = remote.filter(function (r) {
      return r.record_type === 'sponsor_submission' && ['submitted', 'new'].indexOf(r.status) !== -1;
    });
    var html = '<div class="daily-list">';
    if (!due.length && !ready.length && !followUps.length && !newSubmissions.length) {
      html += '<div class="empty">No sponsor payments, partner payouts, prospects, or submissions need attention today.</div>';
    }
    newSubmissions.slice(0, 6).forEach(function (r) {
      html += '<div class="daily-item"><b>Review sponsor: ' + escapeHTML(r.business_name) + '</b><div class="meta-row"><span>' + escapeHTML(r.partner_name || 'partner') + '</span><span>' + escapeHTML(r.requested_tier || 'tier not set') + '</span><span>' + escapeHTML(r.quoted_price || 'price not set') + '</span></div></div>';
    });
    followUps.slice(0, 6).forEach(function (r) {
      html += '<div class="daily-item"><b>Follow up: ' + escapeHTML(r.business_name) + '</b><div class="meta-row"><span>' + escapeHTML(r.partner_name || 'partner') + '</span><span>' + escapeHTML(r.next_follow_up) + '</span><span>' + escapeHTML(r.interest_level || 'interest not set') + '</span></div></div>';
    });
    due.slice(0, 6).forEach(function (r) {
      html += '<div class="daily-item"><b>' + escapeHTML(r.sponsorName || 'Unnamed sponsor') + '</b><div class="meta-row"><span>Sponsor payment due/check today</span><span>' + money(r.monthlyAmount) + '</span><span>' + escapeHTML(r.state) + '</span></div></div>';
    });
    ready.slice(0, 6).forEach(function (r) {
      html += '<div class="daily-item"><b>Pay ' + escapeHTML(r.partnerName || 'partner') + '</b><div class="meta-row"><span>' + escapeHTML(r.sponsorName || 'Sponsor') + '</span><span>' + money(r.commissionDue) + ' commission</span></div></div>';
    });
    html += '</div>';
    return html;
  }

  function renderProspectEntry() {
    return '<details class="prospect-entry">' +
      '<summary>Add prospect manually</summary>' +
      '<form id="prospect-form" novalidate>' +
        '<p class="fine-print">Use this for prospects you or a partner are talking to before they submit a full sponsor ad. Public sponsor inquiries from the SQL table also appear in this pipeline automatically.</p>' +
        '<div class="form-grid">' +
          field('Business name', 'prospectBusinessName', 'text') +
          field('Contact name', 'prospectContactName', 'text') +
          field('Contact email', 'prospectContactEmail', 'email') +
          field('Phone', 'prospectPhone', 'tel') +
          field('Website', 'prospectWebsite', 'url') +
          field('State / placement', 'prospectState', 'text') +
          selectField('Suggested tier', 'prospectTier', ['Not sure yet', 'Community Supporter', 'State Exclusive', 'National Co-Sponsor', 'National Presenting', 'Movement Partner', 'Founding Reserve']) +
          selectField('Status', 'prospectStatus', ['new', 'contacted', 'interested', 'packet_sent', 'submitted']) +
          field('Next follow-up date', 'prospectNextFollowUp', 'date') +
          textareaField('Notes / what they care about', 'prospectNotes') +
        '</div>' +
        '<div class="admin-actions prospect-entry__actions">' +
          '<button class="btn btn--gold" type="submit">Save prospect</button>' +
          '<button class="btn btn--ghost" type="button" id="clear-prospect">Clear prospect</button>' +
        '</div>' +
      '</form>' +
    '</details>';
  }

  function renderRemoteState() {
    if (remoteState.loading) return '<div class="empty">Loading remote inbox...</div>';
    if (remoteState.error) return '<div class="empty admin-danger">Could not load remote inbox: ' + escapeHTML(remoteState.error) + '. Check that the Supabase migration is applied and the API environment variables are set.</div>';
    return '';
  }

  function renderPipelineSummary(prospects) {
    var stages = ['new', 'contacted', 'interested', 'packet_sent', 'submitted', 'won'];
    return '<div class="pipeline-summary">' + stages.map(function (stage) {
      var count = prospects.filter(function (r) { return (r.status || r.prospect_stage) === stage; }).length;
      return '<div class="pipeline-chip"><span>' + escapeHTML(stage.replace(/_/g, ' ')) + '</span><b>' + count + '</b></div>';
    }).join('') + '</div>';
  }

  function renderRemoteList(list, emptyText) {
    if (!list.length) return '<div class="empty">' + emptyText + '</div>';
    return '<div class="remote-list" id="remote-list">' + list.map(renderRemoteCard).join('') + '</div>';
  }

  function renderRemoteCard(r) {
    var title = r.business_name || 'Unnamed business';
    var isSponsor = r.record_type === 'sponsor_submission';
    return '<article class="remote-card" data-remote-id="' + escapeHTML(r.id) + '">' +
      '<div class="remote-card__head">' +
        '<div><h3>' + escapeHTML(title) + '</h3><div class="meta-row"><span>' + escapeHTML(isSponsor ? 'Sponsor submission' : 'Prospect') + '</span><span>Partner: ' + escapeHTML(r.partner_name || 'not set') + '</span><span>' + escapeHTML(r.partner_state || r.state_placement || 'state not set') + '</span></div></div>' +
        '<div>' + statusBadge(r.status || r.prospect_stage || 'new') + '</div>' +
      '</div>' +
      '<div class="remote-details">' +
        detail('Contact', [r.contact_name, r.contact_email, r.phone].filter(Boolean).join(' · ')) +
        detail('Tier / price', [r.requested_tier, r.quoted_price].filter(Boolean).join(' · ')) +
        detail('Website', r.website) +
        detail('Logo', [r.logo_status, r.logo_file_name, r.logo_link_notes].filter(Boolean).join(' · ')) +
        detail('Ad wording', r.ad_wording) +
        detail('Signal / notes', r.best_signal || r.conversation_notes || r.business_description) +
        detail('Next follow-up', r.next_follow_up) +
        detail('Source', r.source_store === 'sponsor_inquiries' ? 'SQL sponsor inquiries' : '') +
      '</div>' +
      '<div class="remote-actions">' +
        (isSponsor ? '<button class="btn btn--gold small-btn" data-remote-action="convert">Add to sponsor ledger</button>' : '') +
        '<button class="btn btn--ghost small-btn" data-remote-action="contacted">Contacted</button>' +
        '<button class="btn btn--ghost small-btn" data-remote-action="interested">Interested</button>' +
        '<button class="btn btn--ghost small-btn" data-remote-action="packet_sent">Packet sent</button>' +
        '<button class="btn btn--ghost small-btn" data-remote-action="reviewing">Reviewing</button>' +
        '<button class="btn btn--ghost small-btn" data-remote-action="won">Won</button>' +
        '<button class="btn btn--ghost small-btn admin-danger" data-remote-action="lost">Lost/pass</button>' +
      '</div>' +
    '</article>';
  }

  function detail(label, value) {
    if (!value) return '';
    return '<p><b>' + escapeHTML(label) + ':</b> ' + escapeHTML(value) + '</p>';
  }

  function renderSponsorForm() {
    return '<div class="admin-panel">' +
      '<h2 class="admin-section-title">Add / Update Sponsor Ledger</h2>' +
      '<p class="fine-print">Use this after the sponsor is approved in Square. This ledger is for daily payment and commission tracking.</p>' +
      '<form id="sponsor-form" novalidate>' +
        '<input type="hidden" id="record-id" />' +
        '<div class="form-actions form-actions--top">' +
          '<button class="btn btn--gold" data-save-sponsor type="button">Save sponsor ledger</button>' +
          '<button class="btn btn--ghost" data-reset-form type="button">Clear form</button>' +
          '<p class="fine-print">After saving, the sponsor appears in the ledger on the right. Square payments and commission actions are tracked from that saved card.</p>' +
        '</div>' +
        '<div class="form-grid">' +
          field('Sponsor business name', 'sponsorName', 'text') +
          field('Display name on ad', 'displayName', 'text') +
          field('State / placement', 'state', 'text') +
          selectField('Tier', 'tier', ['Community Supporter', 'State Exclusive', 'National Co-Sponsor', 'National Presenting', 'Movement Partner', 'Founding Reserve']) +
          field('Monthly amount', 'monthlyAmount', 'number') +
          saleOwnerField() +
          field('Commission rate %', 'commissionRate', 'number', '20') +
          field('Partner name', 'partnerName', 'text') +
          field('Partner email', 'partnerEmail', 'email') +
          selectField('Sponsor status', 'sponsorStatus', ['onboarding', 'active', 'paused', 'canceled']) +
          selectField('Sponsor payment status', 'sponsorPaymentStatus', ['due', 'current', 'late', 'hold']) +
          field('Last sponsor payment date', 'lastSponsorPayment', 'date') +
          field('Next sponsor payment date', 'nextSponsorPayment', 'date', today()) +
          selectField('Commission status', 'commissionStatus', ['hold', 'ready', 'paid']) +
          field('Last commission paid date', 'lastCommissionPaid', 'date') +
          field('Sponsor website link', 'sponsorWebsiteUrl', 'url') +
          field('Square customer link', 'squareCustomerUrl', 'url') +
          field('Square contract link', 'squareContractUrl', 'url') +
          field('Square subscription link', 'squareSubscriptionUrl', 'url') +
          field('Logo file name / link', 'logoFileName', 'text') +
          textareaField('Sponsor ad wording / tagline', 'adWording') +
          textareaField('Public contact line for ad', 'publicContactLine') +
          textareaField('Notes', 'notes') +
        '</div>' +
        '<div class="admin-actions">' +
          '<button class="btn btn--gold" data-save-sponsor type="button">Save sponsor ledger</button>' +
          '<button class="btn btn--ghost" data-reset-form type="button">Clear form</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function field(label, id, type, value) {
    return '<label class="field"><span>' + label + '</span><input id="' + id + '" type="' + type + '" value="' + escapeHTML(value || '') + '" /></label>';
  }

  function textareaField(label, id) {
    return '<label class="field field--wide"><span>' + label + '</span><textarea id="' + id + '"></textarea></label>';
  }

  function selectField(label, id, options) {
    return '<label class="field"><span>' + label + '</span><select id="' + id + '">' +
      options.map(function (opt) { return '<option value="' + escapeHTML(opt) + '">' + escapeHTML(opt) + '</option>'; }).join('') +
      '</select></label>';
  }

  function saleOwnerField() {
    return '<label class="field"><span>Sale owner</span><select id="saleOwner">' +
      '<option value="partner">Partner sale - calculate commission</option>' +
      '<option value="meg">Meg / house sale - no commission</option>' +
      '</select></label>';
  }

  function renderToolbar() {
    return '<div class="toolbar">' +
      '<div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">' +
        '<label class="field"><span>Filter</span><select id="filter-status"><option value="all">All sponsors</option><option value="due">Sponsor payment due</option><option value="ready">Commission ready</option><option value="active">Active sponsors</option><option value="canceled">Canceled</option></select></label>' +
        '<label class="field"><span>Search</span><input id="search-sponsors" type="text" placeholder="Sponsor, partner, state" /></label>' +
      '</div>' +
      '<div class="admin-actions">' +
        '<button class="btn btn--ghost btn--sm" id="export-csv">Export CSV</button>' +
        '<button class="btn btn--ghost btn--sm" id="export-json">Backup JSON</button>' +
        '<label class="btn btn--ghost btn--sm" for="import-json" style="cursor:pointer;">Import JSON</label><input class="visually-hidden" id="import-json" type="file" accept="application/json,.json" />' +
      '</div>' +
    '</div>';
  }

  function filteredRecords() {
    var list = records();
    var status = document.getElementById('filter-status') ? document.getElementById('filter-status').value : 'all';
    var q = document.getElementById('search-sponsors') ? document.getElementById('search-sponsors').value.toLowerCase().trim() : '';
    return list.filter(function (r) {
      var matchesStatus = status === 'all'
        || (status === 'due' && r.sponsorStatus !== 'canceled' && (!r.nextSponsorPayment || r.nextSponsorPayment <= today()))
        || (status === 'ready' && r.commissionStatus === 'ready')
        || r.sponsorStatus === status;
      var haystack = [r.sponsorName, r.displayName, r.state, r.partnerName, r.partnerEmail, r.tier, r.sponsorWebsiteUrl].join(' ').toLowerCase();
      return matchesStatus && (!q || haystack.indexOf(q) !== -1);
    });
  }

  function renderSponsorList(list) {
    if (!list.length) return '<div class="empty">No sponsors saved yet. Add one manually or convert an approved sponsor submission from the inbox.</div>';
    return '<div class="sponsor-list">' + list.map(renderSponsorCard).join('') + '</div>';
  }

  function renderSponsorCard(r) {
    return '<article class="sponsor-card" data-id="' + escapeHTML(r.id) + '">' +
      '<div>' +
        '<h3>' + escapeHTML(r.sponsorName || 'Unnamed sponsor') + '</h3>' +
        '<div class="meta-row">' +
          '<span>' + escapeHTML(r.state || 'No state') + '</span>' +
          '<span>' + escapeHTML(r.tier || 'No tier') + '</span>' +
          '<span>' + money(r.monthlyAmount) + '/mo</span>' +
          '<span>' + (r.saleOwner === 'meg' ? 'Meg / house sale: no commission' : Number(r.commissionRate || 0) + '% = ' + money(r.commissionDue)) + '</span>' +
        '</div>' +
        '<div class="meta-row" style="margin-top:.7rem;">' +
          statusBadge(r.sponsorStatus) + statusBadge(r.sponsorPaymentStatus) + statusBadge(r.commissionStatus) +
          '<span>Next sponsor payment: ' + escapeHTML(r.nextSponsorPayment || 'not set') + '</span>' +
          '<span>Sale owner: ' + escapeHTML(r.saleOwner === 'meg' ? 'Meg / house' : 'Partner') + '</span>' +
          '<span>Partner: ' + escapeHTML(r.saleOwner === 'meg' ? 'none' : (r.partnerName || 'not set')) + '</span>' +
        '</div>' +
        (r.sponsorWebsiteUrl ? '<p class="fine-print"><b>Sponsor website:</b> ' + escapeHTML(r.sponsorWebsiteUrl) + '</p>' : '') +
        (r.adWording ? '<p class="fine-print"><b>Ad wording:</b> ' + escapeHTML(r.adWording) + '</p>' : '') +
        (r.notes ? '<p class="fine-print"><b>Notes:</b> ' + escapeHTML(r.notes) + '</p>' : '') +
      '</div>' +
      '<div class="sponsor-card__actions">' +
        linkButton('Sponsor website', r.sponsorWebsiteUrl) +
        linkButton('Square customer', r.squareCustomerUrl) +
        linkButton('Square contract', r.squareContractUrl) +
        linkButton('Square subscription', r.squareSubscriptionUrl) +
        '<button class="btn btn--gold small-btn" data-action="sponsor-paid">Confirm sponsor paid today</button>' +
        '<button class="btn small-btn" data-action="commission-ready">Set commission ready</button>' +
        '<button class="btn btn--gold small-btn" data-action="commission-paid">Mark commission paid</button>' +
        '<button class="btn btn--ghost small-btn" data-action="edit">Edit</button>' +
        '<button class="btn btn--ghost small-btn admin-danger" data-action="delete">Delete</button>' +
      '</div>' +
    '</article>';
  }

  function linkButton(label, url) {
    if (!url) return '<button class="btn btn--ghost small-btn" disabled>' + label + '</button>';
    return '<a class="btn btn--ghost small-btn" target="_blank" rel="noopener" href="' + escapeHTML(url) + '">' + label + '</a>';
  }

  function bindInquiryEvents() {
    var panel = document.getElementById('inquiries-panel');
    if (!panel) return;

    var refresh = document.getElementById('refresh-inquiries');
    if (refresh) {
      refresh.addEventListener('click', function () {
        clearNewInquiries();
        toast('Refreshing inbox');
        loadRemoteRecords(true, true);
        var syncEl = document.getElementById('inquiry-sync');
        if (syncEl) syncEl.innerHTML = renderInquirySyncBody();
      });
    }

    var search = document.getElementById('inquiry-search');
    if (search) {
      search.addEventListener('input', function () {
        inquiryQuery = search.value;
        var listEl = document.getElementById('inquiry-list');
        if (listEl) listEl.innerHTML = renderInquiryListBody(visibleInquiries());
      });
    }

    // Filter pills and per-card actions are delegated on the panel so that
    // in-place background refreshes (which swap the list/counts) never orphan
    // their click handlers.
    panel.addEventListener('click', function (e) {
      var filterBtn = e.target.closest('[data-inquiry-filter]');
      if (filterBtn) {
        inquiryFilter = filterBtn.getAttribute('data-inquiry-filter') || 'all';
        var countsEl = document.getElementById('inquiry-counts');
        if (countsEl) countsEl.innerHTML = renderInquiryFilterBody();
        var listEl = document.getElementById('inquiry-list');
        if (listEl) listEl.innerHTML = renderInquiryListBody(visibleInquiries());
        return;
      }
      var actionBtn = e.target.closest('[data-remote-action]');
      if (actionBtn) {
        var card = e.target.closest('[data-remote-id]');
        if (!card) return;
        handleRemoteAction(card.getAttribute('data-remote-id'), actionBtn.getAttribute('data-remote-action'));
      }
    });
  }

  function bindDashboardEvents() {
    document.getElementById('admin-signout').addEventListener('click', function () {
      stopPolling();
      clearNewInquiries();
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_CODE_KEY);
      renderLogin();
    });

    document.querySelectorAll('[data-view]').forEach(function (button) {
      button.addEventListener('click', function () {
        activeView = button.getAttribute('data-view') || 'inquiries';
        window.location.hash = activeView;
        renderDashboard();
      });
    });

    bindInquiryEvents();

    var sponsorForm = document.getElementById('sponsor-form');
    if (sponsorForm) {
      sponsorForm.addEventListener('submit', function (e) {
        e.preventDefault();
        saveFormRecord();
      });
    }

    document.querySelectorAll('[data-save-sponsor]').forEach(function (button) {
      button.addEventListener('click', saveFormRecord);
    });
    document.querySelectorAll('[data-reset-form]').forEach(function (button) {
      button.addEventListener('click', clearForm);
    });
    var filterStatus = document.getElementById('filter-status');
    if (filterStatus) filterStatus.addEventListener('change', rerenderListOnly);
    var searchSponsors = document.getElementById('search-sponsors');
    if (searchSponsors) searchSponsors.addEventListener('input', rerenderListOnly);
    var exportCsvButton = document.getElementById('export-csv');
    if (exportCsvButton) exportCsvButton.addEventListener('click', exportCsv);
    var exportJsonButton = document.getElementById('export-json');
    if (exportJsonButton) exportJsonButton.addEventListener('click', exportJson);
    var importJsonInput = document.getElementById('import-json');
    if (importJsonInput) importJsonInput.addEventListener('change', importJson);

    var refresh = document.getElementById('refresh-remote');
    if (refresh) refresh.addEventListener('click', function () { remoteState.loaded = false; loadRemoteRecords(true); toast('Refreshing inbox'); });

    var prospectForm = document.getElementById('prospect-form');
    if (prospectForm) {
      prospectForm.addEventListener('submit', function (e) {
        e.preventDefault();
        saveProspect();
      });
    }
    var clearProspect = document.getElementById('clear-prospect');
    if (clearProspect) clearProspect.addEventListener('click', clearProspectForm);

    document.querySelectorAll('#remote-list [data-remote-action], .remote-list [data-remote-action]').forEach(function (button) {
      button.addEventListener('click', function (e) {
        var card = e.target.closest('[data-remote-id]');
        if (!card) return;
        handleRemoteAction(card.getAttribute('data-remote-id'), button.getAttribute('data-remote-action'));
      });
    });

    var sponsorList = document.getElementById('sponsor-list');
    if (sponsorList) {
      sponsorList.addEventListener('click', function (e) {
        var button = e.target.closest('[data-action]');
        if (!button) return;
        var card = e.target.closest('[data-id]');
        if (!card) return;
        handleCardAction(card.getAttribute('data-id'), button.getAttribute('data-action'));
      });
    }
  }

  function readFormRecord() {
    var id = document.getElementById('record-id').value || uid();
    return normalizeRecord({
      id: id,
      sponsorName: value('sponsorName'),
      displayName: value('displayName'),
      state: value('state'),
      tier: value('tier'),
      monthlyAmount: Number(value('monthlyAmount') || 0),
      saleOwner: value('saleOwner') || 'partner',
      commissionRate: Number(value('commissionRate') || 20),
      partnerName: value('partnerName'),
      partnerEmail: value('partnerEmail'),
      sponsorStatus: value('sponsorStatus'),
      sponsorPaymentStatus: value('sponsorPaymentStatus'),
      lastSponsorPayment: value('lastSponsorPayment'),
      nextSponsorPayment: value('nextSponsorPayment'),
      commissionStatus: value('commissionStatus'),
      lastCommissionPaid: value('lastCommissionPaid'),
      sponsorWebsiteUrl: value('sponsorWebsiteUrl'),
      squareCustomerUrl: value('squareCustomerUrl'),
      squareContractUrl: value('squareContractUrl'),
      squareSubscriptionUrl: value('squareSubscriptionUrl'),
      logoFileName: value('logoFileName'),
      adWording: value('adWording'),
      publicContactLine: value('publicContactLine'),
      notes: value('notes')
    });
  }

  function value(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function setValue(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  function saveFormRecord() {
    var record = readFormRecord();
    if (!record.sponsorName) {
      toast('Add a sponsor business name first');
      return;
    }
    var list = records();
    var idx = list.findIndex(function (r) { return r.id === record.id; });
    if (idx >= 0) list[idx] = record;
    else list.unshift(record);
    setRecords(list);
    clearForm();
    renderDashboard();
    toast('Sponsor saved');
  }

  function saveProspect() {
    var businessName = value('prospectBusinessName');
    if (!businessName) {
      toast('Add a prospect business name first');
      return;
    }
    var record = {
      record_type: 'prospect',
      status: value('prospectStatus') || 'new',
      partner_name: 'Meg / admin',
      business_name: businessName,
      contact_name: value('prospectContactName'),
      contact_email: value('prospectContactEmail'),
      phone: value('prospectPhone'),
      website: value('prospectWebsite'),
      requested_tier: value('prospectTier'),
      state_placement: value('prospectState'),
      conversation_notes: value('prospectNotes'),
      prospect_stage: value('prospectStatus') || 'new',
      next_follow_up: value('prospectNextFollowUp')
    };
    postRemote(record)
      .then(function (json) {
        clearProspectForm();
        remoteState.loaded = false;
        loadRemoteRecords(true);
        // The API emails the record even when the database write fails, so
        // ok:true does not always mean it landed in the pipeline.
        if (json && json.stored === false) {
          toast('Prospect emailed to Meg, but saving to the pipeline failed — it will not appear in this list');
        } else {
          toast('Prospect saved to pipeline');
        }
      })
      .catch(function (err) { toast(err.message || 'Could not save prospect'); });
  }

  function clearProspectForm() {
    Array.prototype.forEach.call(document.querySelectorAll('#prospect-form input, #prospect-form textarea, #prospect-form select'), function (el) {
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
  }

  function clearForm() {
    Array.prototype.forEach.call(document.querySelectorAll('#sponsor-form input, #sponsor-form textarea, #sponsor-form select'), function (el) {
      if (el.type === 'hidden') el.value = '';
      else if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
    setValue('saleOwner', 'partner');
    setValue('commissionRate', '20');
    setValue('nextSponsorPayment', today());
  }

  function fillForm(record) {
    Object.keys(record).forEach(function (key) { setValue(key, record[key]); });
    document.getElementById('record-id').value = record.id;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function parseMonthlyAmount(price) {
    var match = String(price || '').replace(/,/g, '').match(/(\d+(\.\d+)?)/);
    return match ? Number(match[1]) : 0;
  }

  function convertRemoteToSponsor(remote) {
    var record = normalizeRecord({
      id: 'sponsor_from_' + remote.id,
      sponsorName: remote.business_name,
      displayName: remote.display_name || remote.business_name,
      state: remote.state_placement || remote.partner_state,
      tier: remote.requested_tier || 'State Exclusive',
      monthlyAmount: parseMonthlyAmount(remote.quoted_price),
      saleOwner: remote.partner_name || remote.partner_email ? 'partner' : 'meg',
      commissionRate: remote.partner_name || remote.partner_email ? 20 : 0,
      partnerName: remote.partner_name,
      partnerEmail: remote.partner_email,
      sponsorStatus: 'onboarding',
      sponsorPaymentStatus: 'due',
      nextSponsorPayment: today(),
      commissionStatus: 'hold',
      sponsorWebsiteUrl: remote.website,
      logoFileName: remote.logo_file_name || remote.logo_link_notes,
      adWording: remote.ad_wording,
      publicContactLine: remote.public_contact_line,
      notes: [
        'Converted from partner portal inbox.',
        remote.contact_name ? 'Contact: ' + remote.contact_name : '',
        remote.contact_email ? 'Email: ' + remote.contact_email : '',
        remote.phone ? 'Phone: ' + remote.phone : '',
        remote.website ? 'Website: ' + remote.website : '',
        remote.conversation_notes ? 'Notes: ' + remote.conversation_notes : ''
      ].filter(Boolean).join('\n')
    });
    var list = records();
    var exists = list.some(function (r) { return r.id === record.id; });
    if (!exists) {
      list.unshift(record);
      setRecords(list);
    }
    return patchRemote(remote.id, { status: 'reviewing', prospect_stage: 'reviewing' });
  }

  function handleRemoteAction(id, action) {
    var remote = remoteRecords().find(function (r) { return r.id === id; });
    if (!remote) return;
    if (newInquiryIds[id]) { delete newInquiryIds[id]; updateBrowserBadge(); }
    if (action === 'convert') {
      convertRemoteToSponsor(remote)
        .then(function () { toast('Added to sponsor ledger'); })
        .catch(function (err) { toast(err.message || 'Could not convert sponsor'); });
      return;
    }
    var nextStatus = action === 'lost' ? 'lost' : action;
    patchRemote(id, { status: nextStatus, prospect_stage: nextStatus })
      .then(function () { toast('Pipeline updated'); })
      .catch(function (err) { toast(err.message || 'Could not update pipeline'); });
  }

  function handleCardAction(id, action) {
    var list = records();
    var idx = list.findIndex(function (r) { return r.id === id; });
    if (idx < 0) return;
    var record = list[idx];
    if (action === 'edit') {
      if (!document.getElementById('sponsor-form')) {
        activeView = 'sponsors';
        window.location.hash = activeView;
        renderDashboard();
      }
      fillForm(record);
      return;
    }
    if (action === 'delete') {
      if (!window.confirm('Delete this sponsor record? Export a backup first if you need it.')) return;
      list.splice(idx, 1);
      setRecords(list);
      renderDashboard();
      toast('Sponsor deleted');
      return;
    }
    if (action === 'sponsor-paid') {
      record.sponsorStatus = 'active';
      record.sponsorPaymentStatus = 'current';
      record.lastSponsorPayment = today();
      record.nextSponsorPayment = addDays(today(), 30);
      record.commissionStatus = record.saleOwner === 'meg' ? 'hold' : 'ready';
      list[idx] = record;
      setRecords(list);
      renderDashboard();
      toast(record.saleOwner === 'meg' ? 'Sponsor payment confirmed; no partner commission due' : 'Sponsor payment confirmed; commission is ready');
      return;
    }
    if (action === 'commission-ready') {
      if (record.saleOwner === 'meg') {
        record.commissionStatus = 'hold';
        list[idx] = record;
        setRecords(list);
        renderDashboard();
        toast('Meg / house sale: no partner commission due');
        return;
      }
      record.commissionStatus = 'ready';
      list[idx] = record;
      setRecords(list);
      renderDashboard();
      toast('Commission marked ready');
      return;
    }
    if (action === 'commission-paid') {
      if (record.saleOwner === 'meg') {
        record.commissionStatus = 'hold';
        record.lastCommissionPaid = '';
        list[idx] = record;
        setRecords(list);
        renderDashboard();
        toast('Meg / house sale: no partner payout to mark paid');
        return;
      }
      record.commissionStatus = 'paid';
      record.lastCommissionPaid = today();
      list[idx] = record;
      setRecords(list);
      renderDashboard();
      toast('Commission marked paid');
    }
  }

  function rerenderListOnly() {
    var sponsorList = document.getElementById('sponsor-list');
    if (sponsorList) sponsorList.innerHTML = renderSponsorList(filteredRecords());
  }

  function csvCell(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    var headers = ['Sponsor', 'Display name', 'State', 'Tier', 'Monthly amount', 'Sale owner', 'Partner', 'Partner email', 'Commission rate', 'Commission due', 'Sponsor status', 'Sponsor payment status', 'Last sponsor payment', 'Next sponsor payment', 'Commission status', 'Last commission paid', 'Sponsor website', 'Square customer', 'Square contract', 'Square subscription', 'Logo', 'Ad wording', 'Public contact', 'Notes'];
    var rows = records().map(function (r) {
      return [r.sponsorName, r.displayName, r.state, r.tier, r.monthlyAmount, r.saleOwner, r.partnerName, r.partnerEmail, r.commissionRate, r.commissionDue, r.sponsorStatus, r.sponsorPaymentStatus, r.lastSponsorPayment, r.nextSponsorPayment, r.commissionStatus, r.lastCommissionPaid, r.sponsorWebsiteUrl, r.squareCustomerUrl, r.squareContractUrl, r.squareSubscriptionUrl, r.logoFileName, r.adWording, r.publicContactLine, r.notes];
    });
    download('stand-with-meg-sponsors-' + today() + '.csv', [headers].concat(rows).map(function (row) { return row.map(csvCell).join(','); }).join('\n'), 'text/csv');
  }

  function exportJson() {
    download('stand-with-meg-sponsors-backup-' + today() + '.json', JSON.stringify(records(), null, 2), 'application/json');
  }

  function importJson(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var imported = JSON.parse(String(reader.result || '[]'));
        if (!Array.isArray(imported)) throw new Error('Backup must be an array');
        setRecords(imported.map(normalizeRecord));
        renderDashboard();
        toast('Backup imported');
      } catch (err) {
        toast('Could not import that JSON file');
      }
    };
    reader.readAsText(file);
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (isAuthed()) renderDashboard();
  else renderLogin();
})();
