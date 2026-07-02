/* App — renders the portal shell, nav, lessons, and wires interactions. */

(function () {
  // Guard: must be logged in
  if (!SWM_Auth.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  var partner = SWM_Auth.current();
  var lessons = window.SWM_LESSONS || [];
  var state = partner.state || 'your state';
  var stateCode = partner.stateCode || state;
  var statePdf = partner.statePdf || (state + '.pdf');

  // Tidy up casing so "meg" / "oklahoma" display as "Meg" / "Oklahoma"
  function titleCase(s) {
    return String(s).toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function slugFile(s) {
    return encodeURIComponent(String(s).replace(/\.pdf$/i, '')).replace(/%20/g, '+') + '.pdf';
  }
  var nameDisplay = titleCase(partner.name || 'Partner');
  var stateTitle = titleCase(state);
  var safeName = escapeHTML(nameDisplay);
  var safeStateTitle = escapeHTML(stateTitle);
  var safeStateUpper = escapeHTML(String(stateTitle).toUpperCase());
  var safeStateCode = escapeHTML(String(stateCode).trim());
  var safeStatePdf = escapeHTML(slugFile(statePdf));
  var sponsorSubmissionEmail = 'meg@standwithmeg.com';
  var portalSubmissionEndpoint = '/api/partner-portal/submissions';

  var els = {
    nav: document.getElementById('nav'),
    main: document.getElementById('main'),
    greetName: document.getElementById('greet-name'),
    greetState: document.getElementById('greet-state'),
    fill: document.getElementById('progress-fill'),
    count: document.getElementById('progress-count'),
    total: document.getElementById('progress-total'),
    shell: document.getElementById('shell'),
    toast: document.getElementById('toast')
  };

  els.greetName.textContent = nameDisplay;
  els.greetState.textContent = stateTitle;
  els.total.textContent = lessons.length;

  var activeId = lessons.length ? lessons[0].id : null;

  // ---- Helpers ----
  function fillState(str) {
    // Replace [State] / [STATE] placeholders with the partner's state
    return String(str)
      .replace(/\[State\]/g, safeStateTitle)
      .replace(/\[STATE\]/g, safeStateUpper)
      .replace(/\[STATE_CODE\]/g, safeStateCode)
      .replace(/\[STATE_PDF\]/g, safeStatePdf)
      .replace(/\[Your Name\]/g, safeName);
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('is-show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { els.toast.classList.remove('is-show'); }, 1800);
  }

  function packetFieldValue(field) {
    if (field.type === 'checkbox') return field.checked ? 'Yes' : 'No';
    if (field.type === 'file') {
      if (!field.files || !field.files.length) return '[not selected]';
      return Array.prototype.map.call(field.files, function (file) {
        return file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
      }).join(', ');
    }
    return field.value.trim();
  }

  function packetFields(form) {
    var values = [];
    form.querySelectorAll('[data-packet-field]').forEach(function (field) {
      var label = field.getAttribute('data-label') || field.name || 'Field';
      values.push({ label: label, field: field, value: packetFieldValue(field) });
    });
    return values;
  }

  function buildPacket(form) {
    var title = form.getAttribute('data-packet-title') || 'Stand With Meg packet';
    var lines = [title, 'Partner: ' + nameDisplay, 'Region: ' + stateTitle, ''];
    packetFields(form).forEach(function (item) {
      lines.push(item.label + ': ' + (item.value || '[not filled]'));
    });
    return { title: title, text: lines.join('\n') };
  }

  function keyForLabel(label) {
    return ({
      'Business name': 'business_name',
      'Display name for ad': 'display_name',
      'Signer / decision-maker': 'contact_name',
      'Contact person': 'contact_name',
      'Email': 'contact_email',
      'Contact email': 'contact_email',
      'Phone': 'phone',
      'Contact phone': 'phone',
      'Website or social link': 'website',
      'Website / social link': 'website',
      'Requested tier': 'requested_tier',
      'Suggested tier': 'requested_tier',
      'Quoted price': 'quoted_price',
      'State / placement': 'state_placement',
      'Law firm / attorney': 'law_firm_status',
      'Logo file status': 'logo_status',
      'Logo file selected': 'logo_file_name',
      'Sponsor ad wording / tagline': 'ad_wording',
      'Public contact line for ad': 'public_contact_line',
      'Logo link or notes': 'logo_link_notes',
      'Business description / mission fit': 'business_description',
      'Conversation notes': 'conversation_notes',
      'Prospect stage': 'prospect_stage',
      'Interest level': 'interest_level',
      'Best signal': 'best_signal',
      'Next follow-up date': 'next_follow_up',
      'Partner confirmed no approval promise': 'approval_acknowledgement'
    })[label] || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  function firstLogoFile(form) {
    var fileInput = form.querySelector('input[type="file"][data-packet-field]');
    return fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
  }

  function buildPortalRecord(form) {
    var fields = {};
    packetFields(form).forEach(function (item) {
      fields[keyForLabel(item.label)] = item.value && item.value !== '[not selected]' ? item.value : '';
    });

    return Object.assign(fields, {
      record_type: form.getAttribute('data-record-type') || 'sponsor_submission',
      partner_name: nameDisplay,
      partner_email: partner.email || '',
      partner_state: stateTitle,
      status: form.getAttribute('data-record-type') === 'prospect' ? 'new' : 'submitted'
    });
  }

  function businessNameForSubject(form) {
    var business = form.querySelector('[data-label="Business name"]');
    return business && business.value.trim() ? business.value.trim() : 'New sponsor';
  }

  function openMailDraft(form) {
    var packet = buildPacket(form);
    var recordType = form.getAttribute('data-record-type') || 'sponsor_submission';
    var subjectPrefix = recordType === 'prospect' ? 'Partner prospect' : 'Sponsor submission';
    var subject = subjectPrefix + ': ' + businessNameForSubject(form) + ' — ' + stateTitle;
    var body = packet.text + '\n\nLogo note: if a logo file was selected in the portal, attach that file before sending. The portal cannot attach files to a mail draft automatically.';
    window.location.href = 'mailto:' + sponsorSubmissionEmail +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  }

  function setSubmitting(button, isSubmitting) {
    if (!button) return;
    if (isSubmitting) {
      button.dataset.originalText = button.textContent;
      button.textContent = 'Submitting...';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function submitPortalRecord(form, button) {
    var record = buildPortalRecord(form);
    if (!record.business_name) {
      toast('Add the business name first');
      return;
    }

    var fd = new FormData();
    fd.append('record', JSON.stringify(record));
    var logo = firstLogoFile(form);
    if (logo) fd.append('logo', logo);

    setSubmitting(button, true);
    fetch(portalSubmissionEndpoint, { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          if (!res.ok) throw new Error(json.error || 'Submission failed');
          return json;
        });
      })
      .then(function (json) {
        if (json.stored) {
          toast('Sent to Meg and saved in admin inbox');
        } else {
          toast('Sent to Meg. Admin save needs the database migration.');
        }
      })
      .catch(function () {
        openMailDraft(form);
        toast('Could not submit online; email draft opened');
      })
      .finally(function () {
        setSubmitting(button, false);
      });
  }

  function updateProgress() {
    var done = 0;
    lessons.forEach(function (l) { if (SWM_Progress.isDone(l.id)) done++; });
    els.count.textContent = done;
    els.fill.style.width = (lessons.length ? (done / lessons.length) * 100 : 0) + '%';
  }

  // ---- Nav ----
  function renderNav() {
    els.nav.innerHTML = '';
    lessons.forEach(function (l) {
      var btn = document.createElement('button');
      btn.className = 'nav__item';
      btn.dataset.lessonId = l.id;
      if (l.id === activeId) btn.classList.add('is-active');
      if (SWM_Progress.isDone(l.id)) btn.classList.add('is-done');
      btn.innerHTML = '<span class="nav__num"><span>' + l.num + '</span></span>' +
        '<span>' + l.title + '</span>';
      btn.addEventListener('click', function () { go(l.id); closeMenu(); });
      els.nav.appendChild(btn);
    });
  }

  // ---- Lesson view ----
  function renderLesson(l) {
    var done = SWM_Progress.isDone(l.id);
    var idx = lessons.findIndex(function (x) { return x.id === l.id; });
    var next = lessons[idx + 1];

    var html =
      '<article class="lesson">' +
        '<div class="lesson__head">' +
          '<p class="eyebrow eyebrow--rule">Module ' + l.num + ' &middot; ' + l.minutes + ' min read</p>' +
          '<h1 class="lesson__title">' + l.title + '</h1>' +
          (l.summary ? '<p class="lesson__sub">' + l.summary + '</p>' : '') +
        '</div>' +
        '<div class="lesson__body">' + fillState(l.html) + '</div>' +
        '<div class="lesson__foot">' +
          '<label style="display:flex;align-items:center;gap:.6em;cursor:pointer;font-weight:600;">' +
            '<input type="checkbox" id="mark-done" ' + (done ? 'checked' : '') + ' style="width:1.4em;height:1.4em;accent-color:var(--color-success);" />' +
            ' Mark this module complete' +
          '</label>' +
          (next ? '<button class="btn" id="next-btn">Next: ' + next.title + ' →</button>'
                : '<button class="btn btn--gold" id="next-btn">Finish 🎉</button>') +
        '</div>' +
      '</article>';

    els.main.innerHTML = html;

    // Mount any calculator placeholder
    var calcEl = els.main.querySelector('[data-calc]');
    if (calcEl && window.SWM_Calc) SWM_Calc.mount(calcEl);

    // Copy buttons
    els.main.querySelectorAll('[data-copy]').forEach(function (block) {
      var btn = block.querySelector('.copy-btn');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var text = block.querySelector('.copy-block__text').innerText;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () { toast('Copied to clipboard ✓'); });
        } else { toast('Select and copy the text'); }
      });
    });

    // Packet builders turn form fields into a clean copy/paste handoff or email draft.
    els.main.querySelectorAll('[data-packet]').forEach(function (form) {
      var btn = form.querySelector('[data-copy-packet]');
      if (btn) {
        btn.addEventListener('click', function () {
          var packet = buildPacket(form);
          if (navigator.clipboard) {
            navigator.clipboard.writeText(packet.text).then(function () { toast('Packet copied — send it to your team lead'); });
          } else { toast('Select and copy the packet fields'); }
        });
      }

      var emailBtn = form.querySelector('[data-email-packet]');
      if (emailBtn) {
        emailBtn.addEventListener('click', function () {
          openMailDraft(form);
          toast('Email draft opened — attach the logo before sending');
        });
      }

      var submitBtn = form.querySelector('[data-submit-record]');
      if (submitBtn) {
        submitBtn.addEventListener('click', function () {
          submitPortalRecord(form, submitBtn);
        });
      }
    });

    // Mark done
    var mark = els.main.querySelector('#mark-done');
    mark.addEventListener('change', function () {
      SWM_Progress.setDone(l.id, mark.checked);
      updateProgress();
      renderNav();
      if (mark.checked) toast('Nice — module complete 💛');
    });

    // Next
    var nextBtn = els.main.querySelector('#next-btn');
    nextBtn.addEventListener('click', function () {
      if (!SWM_Progress.isDone(l.id)) {
        SWM_Progress.setDone(l.id, true);
        updateProgress();
      }
      if (next) { go(next.id); }
      else { renderNav(); finishScreen(); }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    els.main.focus();
  }

  function finishScreen() {
    els.main.innerHTML =
      '<article class="lesson" style="text-align:center;max-width:640px;margin-inline:auto;">' +
        '<p class="eyebrow">You did it</p>' +
        '<h1 class="lesson__title">You\'re ready, ' + safeName + '.</h1>' +
        '<p>You\'ve finished every module. You know the pitch, the brand, your first 7 days, the payout setup, and exactly how to submit a sponsor. Now go stand with families in ' + safeStateTitle + '.</p>' +
        '<div class="callout"><span class="callout__label">Your next move</span>' +
        'Make your list of 10 local businesses today, then reach out to your top 3. Warm beats cold every time.</div>' +
        '<button class="btn btn--gold" id="restart">Back to the start</button>' +
      '</article>';
    var r = els.main.querySelector('#restart');
    if (r) r.addEventListener('click', function () { go(lessons[0].id); });
  }

  function go(id) {
    activeId = id;
    var l = lessons.find(function (x) { return x.id === id; });
    if (!l) return;
    renderNav();
    renderLesson(l);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- Mobile menu ----
  function closeMenu() { els.shell.classList.remove('is-open'); }
  document.getElementById('hamburger').addEventListener('click', function () {
    els.shell.classList.toggle('is-open');
  });
  document.getElementById('backdrop').addEventListener('click', closeMenu);

  // ---- Sign out ----
  document.getElementById('signout').addEventListener('click', function () {
    SWM_Auth.signout();
    window.location.href = 'index.html';
  });

  // ---- Init ----
  renderNav();
  updateProgress();
  if (activeId) go(activeId);
})();
