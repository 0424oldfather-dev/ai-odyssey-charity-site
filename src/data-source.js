(function () {
  'use strict';

  const PUBLIC_SNAPSHOT_PATH = 'data/public-snapshot.json';

  const EFFECTIVE_START_DATE = '2026-11-01';
  const EFFECTIVE_START_MONTH = '2026-11';
  const THRESHOLD_CENTS = 100000;
  const allowedKeys = {
    root: ['schemaVersion', 'publishedAt', 'prelaunch', 'isDemo', 'meta', 'totals', 'monthly', 'donations'],
    meta: ['currency', 'effectiveStartDate', 'allocationPercent'],
    totals: ['commissionCents', 'allocationCents', 'donationCents', 'balanceCents', 'thresholdCents', 'progress', 'donationDue'],
    month: ['month', 'commissionCents', 'allocationCents', 'donationCents', 'closingBalanceCents'],
    donation: ['id', 'date', 'organization', 'purpose', 'amountCents', 'status']
  };

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]';
  }

  function assertExactKeys(value, expected, label) {
    if (!isPlainObject(value)) throw new Error('Invalid public snapshot object: ' + label);
    const actual = Object.keys(value).sort();
    const wanted = expected.slice().sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
      throw new Error('Unexpected public snapshot fields: ' + label);
    }
  }

  function assertNonNegativeCents(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Invalid public snapshot amount: ' + label);
    }
  }

  function assertText(value, label, maxLength) {
    if (typeof value !== 'string' || value.trim() !== value || !value || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('Invalid public snapshot text: ' + label);
    }
  }

  function assertDate(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error('Invalid public snapshot date: ' + label);
    }
    const [year, month, day] = value.split('-').map(Number);
    const normalized = new Date(Date.UTC(year, month - 1, day));
    if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== day) {
      throw new Error('Invalid public snapshot date: ' + label);
    }
  }

  function assertPublishedAt(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
      throw new Error('Invalid public snapshot publication timestamp');
    }
  }

  function validate(snapshot) {
    assertExactKeys(snapshot, allowedKeys.root, 'root');
    if (snapshot.schemaVersion !== 1 || snapshot.isDemo !== false || typeof snapshot.prelaunch !== 'boolean') {
      throw new Error('Invalid public snapshot metadata');
    }
    assertExactKeys(snapshot.meta, allowedKeys.meta, 'meta');
    if (snapshot.meta.currency !== 'TWD' || snapshot.meta.effectiveStartDate !== EFFECTIVE_START_DATE || snapshot.meta.allocationPercent !== 50) {
      throw new Error('Unexpected public accounting settings');
    }

    assertExactKeys(snapshot.totals, allowedKeys.totals, 'totals');
    const totals = snapshot.totals;
    for (const field of ['commissionCents', 'allocationCents', 'donationCents', 'balanceCents', 'thresholdCents']) {
      assertNonNegativeCents(totals[field], 'totals.' + field);
    }
    if (totals.thresholdCents !== THRESHOLD_CENTS || typeof totals.progress !== 'number' || !Number.isFinite(totals.progress) ||
        totals.progress < 0 || totals.progress > 1 || typeof totals.donationDue !== 'boolean') {
      throw new Error('Invalid public threshold state');
    }
    if (totals.allocationCents > totals.commissionCents || totals.balanceCents !== totals.allocationCents - totals.donationCents) {
      throw new Error('Inconsistent public totals');
    }
    const expectedProgress = Math.min(totals.balanceCents / THRESHOLD_CENTS, 1);
    if (Math.abs(totals.progress - expectedProgress) > 1e-12 || totals.donationDue !== (totals.balanceCents >= THRESHOLD_CENTS)) {
      throw new Error('Inconsistent public threshold calculation');
    }
    if (!Array.isArray(snapshot.monthly) || !Array.isArray(snapshot.donations)) throw new Error('Incomplete public snapshot');

    let commissionSum = 0;
    let allocationSum = 0;
    let donationSum = 0;
    let runningBalance = 0;
    let previousMonth = '';
    const monthlyDonationTotals = new Map();
    for (const [index, month] of snapshot.monthly.entries()) {
      const label = 'monthly[' + index + ']';
      assertExactKeys(month, allowedKeys.month, label);
      if (typeof month.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month.month) ||
          month.month < EFFECTIVE_START_MONTH || (previousMonth && month.month <= previousMonth)) {
        throw new Error('Invalid or unsorted public month: ' + label);
      }
      previousMonth = month.month;
      for (const field of ['commissionCents', 'allocationCents', 'donationCents', 'closingBalanceCents']) {
        assertNonNegativeCents(month[field], label + '.' + field);
      }
      if (month.allocationCents > month.commissionCents) throw new Error('Monthly allocation exceeds approved commission: ' + label);
      commissionSum += month.commissionCents;
      allocationSum += month.allocationCents;
      donationSum += month.donationCents;
      if (![commissionSum, allocationSum, donationSum].every(Number.isSafeInteger)) throw new Error('Public snapshot totals exceed safe integer limits');
      runningBalance += month.allocationCents - month.donationCents;
      if (!Number.isSafeInteger(runningBalance) || runningBalance < 0 || month.closingBalanceCents !== runningBalance) {
        throw new Error('Invalid monthly balance roll-forward: ' + label);
      }
      monthlyDonationTotals.set(month.month, 0);
    }

    const donationIds = new Set();
    let donationDetailSum = 0;
    for (const [index, donation] of snapshot.donations.entries()) {
      const label = 'donations[' + index + ']';
      assertExactKeys(donation, allowedKeys.donation, label);
      assertText(donation.id, label + '.id', 80);
      assertText(donation.organization, label + '.organization', 120);
      assertText(donation.purpose, label + '.purpose', 240);
      assertDate(donation.date, label + '.date');
      assertNonNegativeCents(donation.amountCents, label + '.amountCents');
      if (donation.amountCents === 0 || donation.status !== 'paid' || donation.date < EFFECTIVE_START_DATE || donationIds.has(donation.id)) {
        throw new Error('Invalid public donation: ' + label);
      }
      const monthKey = donation.date.slice(0, 7);
      if (!monthlyDonationTotals.has(monthKey)) throw new Error('Donation has no matching monthly record: ' + label);
      donationIds.add(donation.id);
      donationDetailSum += donation.amountCents;
      if (!Number.isSafeInteger(donationDetailSum)) throw new Error('Donation total exceeds safe integer limits');
      monthlyDonationTotals.set(monthKey, monthlyDonationTotals.get(monthKey) + donation.amountCents);
    }

    for (const month of snapshot.monthly) {
      if (monthlyDonationTotals.get(month.month) !== month.donationCents) {
        throw new Error('Donation details do not match monthly total: ' + month.month);
      }
    }
    if (commissionSum !== totals.commissionCents || allocationSum !== totals.allocationCents ||
        donationSum !== totals.donationCents || donationDetailSum !== totals.donationCents || runningBalance !== totals.balanceCents) {
      throw new Error('Monthly records or donation details do not match totals');
    }

    if (snapshot.prelaunch) {
      if (snapshot.publishedAt !== null || snapshot.monthly.length || snapshot.donations.length || totals.commissionCents ||
          totals.allocationCents || totals.donationCents || totals.balanceCents) {
        throw new Error('Prelaunch snapshot must contain no approved financial records');
      }
    } else {
      assertPublishedAt(snapshot.publishedAt);
      assertDate(snapshot.publishedAt.slice(0, 10), 'publishedAt');
      if (snapshot.publishedAt.slice(0, 10) < EFFECTIVE_START_DATE) throw new Error('Publication timestamp precedes the official start date');
      if (!snapshot.monthly.length) throw new Error('Published snapshot must contain a monthly record');
    }
    return snapshot;
  }

  async function load() {
    const url = new URL(PUBLIC_SNAPSHOT_PATH, document.baseURI);
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Public snapshot request failed: ' + response.status);
    return validate(await response.json());
  }

  window.CharitySnapshotValidation = { validate };
  window.CharityDataSource = { load };
})();
