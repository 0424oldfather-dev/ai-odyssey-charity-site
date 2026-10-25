(function () {
  'use strict';

  const resources = window.CharityI18n;
  let snapshot = null;
  let loadError = false;
  const languageSelect = document.getElementById('language');
  const $ = id => document.getElementById(id);
  const text = (element, value) => { element.textContent = value; return element; };

  function formatMoney(cents, language) {
    const locale = resources[language].locale;
    return 'NT$' + new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cents / 100);
  }

  function formatDate(date, language) {
    const [year, month, day] = date.split('-').map(Number);
    return new Intl.DateTimeFormat(resources[language].locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  function formatMonth(month, language) {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Intl.DateTimeFormat(resources[language].locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  }

  function hasApprovedRecords(publicSnapshot) {
    const total = publicSnapshot.totals;
    return publicSnapshot.monthly.length > 0 || publicSnapshot.donations.length > 0 ||
      total.commissionCents > 0 || total.allocationCents > 0 || total.donationCents > 0 || total.balanceCents > 0;
  }

  function cell(value) {
    return text(document.createElement('td'), value);
  }

  function renderMonthly(language) {
    const body = $('monthly-body');
    body.replaceChildren();
    if (!snapshot.monthly.length) {
      const row = document.createElement('tr');
      const empty = cell(resources[language].noMonthlyRecords);
      empty.colSpan = 5;
      empty.className = 'empty-ledger';
      row.append(empty);
      body.append(row);
      return;
    }
    for (const month of snapshot.monthly) {
      const row = document.createElement('tr');
      row.append(
        cell(formatMonth(month.month, language)),
        cell(formatMoney(month.commissionCents, language)),
        cell(formatMoney(month.allocationCents, language)),
        cell(formatMoney(month.donationCents, language)),
        cell(formatMoney(month.closingBalanceCents, language))
      );
      body.append(row);
    }
  }

  function detailField(label, value) {
    const p = document.createElement('p');
    const strong = text(document.createElement('strong'), label + '：');
    p.append(strong, document.createTextNode(value));
    return p;
  }

  function summaryField(label, value, className) {
    const div = document.createElement('div');
    div.className = 'donation-main ' + className;
    div.append(text(document.createElement('small'), label), text(document.createElement('strong'), value));
    return div;
  }

  function renderDonations(language, t) {
    const list = $('donation-list');
    const expanded = new Set([...list.querySelectorAll('details[open]')].map(card => card.dataset.donationId));
    list.replaceChildren();
    if (!snapshot.donations.length) {
      const empty = text(document.createElement('p'), t.noDonationsYet);
      empty.className = 'empty-donations';
      list.append(empty);
      return;
    }
    snapshot.donations.forEach((donation, index) => {
      const record = index === 0 ? 'A' : 'B';
      const organization = snapshot.isDemo ? t['demoOrg' + record] : donation.organization;
      const purpose = snapshot.isDemo ? t['demoPurpose' + record] : donation.purpose;
      const note = snapshot.isDemo ? t['demoNote' + record] : '';
      const card = document.createElement('details');
      card.className = 'donation-card';
      card.dataset.donationId = donation.id;
      card.open = expanded.has(donation.id);
      const summary = document.createElement('summary');
      summary.setAttribute('aria-label', t.details + ': ' + donation.id);
      const status = document.createElement('div');
      status.className = 'donation-main status-cell';
      const pill = text(document.createElement('span'), t[donation.status]);
      pill.className = 'status-pill ' + donation.status;
      status.append(text(document.createElement('small'), t.status), pill);
      const amount = summaryField(t.amount, formatMoney(donation.amountCents, language), 'amount-cell');
      amount.querySelector('strong').className = 'amount-text';
      summary.append(
        summaryField(t.donationId, donation.id, 'id-cell'),
        summaryField(t.donationDate, formatDate(donation.date, language), 'date-cell'),
        summaryField(t.organization, organization, 'organization-cell'),
        summaryField(t.purpose, purpose, 'purpose-cell'),
        amount,
        status,
        text(document.createElement('span'), '⌄')
      );
      summary.lastChild.className = 'donation-chevron';
      const details = document.createElement('div');
      details.className = 'donation-detail';
      details.append(
        detailField(t.donationId, donation.id),
        detailField(t.donationDate, formatDate(donation.date, language)),
        detailField(t.organization, organization),
        detailField(t.purpose, purpose),
        detailField(t.amount, formatMoney(donation.amountCents, language)),
        detailField(t.status, t[donation.status])
      );
      if (note) details.append(text(document.createElement('p'), note));
      const receipt = text(document.createElement('p'), 'ⓘ ' + t.receiptPrivate);
      receipt.className = 'receipt-note';
      details.append(receipt);
      card.append(summary, details);
      list.append(card);
    });
  }

  function render(language) {
    const t = resources[language];
    document.documentElement.lang = language;
    document.title = 'AI Odyssey Charity | ' + t.overviewTitle;
    document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t[element.dataset.i18n]; });
    document.querySelectorAll('[data-i18n-html]').forEach(element => { element.innerHTML = t[element.dataset.i18nHtml]; });
    languageSelect.value = language;
    languageSelect.setAttribute('aria-label', t.language);
    document.querySelector('.site-nav').setAttribute('aria-label', t.navAria);
    document.querySelector('.table-wrap').setAttribute('aria-label', t.tableAria);
    const error = $('data-error');
    error.hidden = !loadError;
    if (loadError) error.textContent = t.dataLoadError;
    if (!snapshot) return;

    const formalStartDate = snapshot.meta ? snapshot.meta.effectiveStartDate : snapshot.formalEffectiveStartDate;
    document.querySelector('.start-status strong').textContent = formalStartDate
      ? formatDate(formalStartDate, language) : t.undecided;
    if (snapshot.prelaunch || !snapshot.publishedAt) {
      text($('last-published'), t.noApprovedRecords);
    } else {
      const localPublicationDate = window.CharitySnapshotValidation.publicationDateInTaipei(snapshot.publishedAt);
      const publicationText = formatDate(localPublicationDate, language);
      text($('last-published'), hasApprovedRecords(snapshot)
        ? publicationText : publicationText + ' · ' + t.noApprovedRecords);
    }

    const total = snapshot.totals;
    const showMoney = !snapshot.prelaunch;
    text($('total-commission'), showMoney ? formatMoney(total.commissionCents, language) : '—');
    text($('total-allocation'), showMoney ? formatMoney(total.allocationCents, language) : '—');
    text($('total-donation'), showMoney ? formatMoney(total.donationCents, language) : '—');
    text($('reserve-balance'), showMoney ? formatMoney(total.balanceCents, language) : '—');
    text($('threshold-amount'), formatMoney(total.thresholdCents, language));
    text($('threshold-status'), showMoney ? (total.donationDue ? t.thresholdReached : t.thresholdRemaining + ' ' + formatMoney(total.thresholdCents - total.balanceCents, language)) : t.awaitingStart);
    text($('threshold-percent'), showMoney ? Math.round(total.progress * 100) + '%' : '—');
    $('progress-fill').style.width = showMoney ? (total.progress * 100) + '%' : '0%';
    $('progress-track').setAttribute('aria-valuenow', String(Math.round(total.progress * 100)));
    $('progress-track').setAttribute('aria-label', t.progressLabel);
    renderMonthly(language);
    renderDonations(language, t);
    if (window.CharityMotion) window.CharityMotion.onRender(showMoney ? total : null, formatMoney, language);
  }

  let initial = 'zh-TW';
  try {
    const saved = localStorage.getItem('ai-odyssey-language');
    if (Object.prototype.hasOwnProperty.call(resources, saved)) initial = saved;
    else {
      const browserLanguage = navigator.language.toLowerCase();
      initial = Object.keys(resources).find(key => browserLanguage === key.toLowerCase() || browserLanguage.startsWith(key.toLowerCase() + '-')) || 'zh-TW';
    }
  } catch (_) { /* Local storage may be disabled in private browsing. */ }
  render(initial);
  languageSelect.addEventListener('change', event => {
    const language = event.target.value;
    if (!Object.prototype.hasOwnProperty.call(resources, language)) return;
    render(language);
    try { localStorage.setItem('ai-odyssey-language', language); } catch (_) { /* Optional preference only. */ }
  });
  window.CharityDataSource.load().then(publicSnapshot => {
    snapshot = publicSnapshot;
    render(languageSelect.value);
  }).catch(() => {
    loadError = true;
    render(languageSelect.value);
  });
})();
