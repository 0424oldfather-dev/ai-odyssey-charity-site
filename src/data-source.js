(function () {
  'use strict';

  const PUBLIC_SNAPSHOT_PATH = 'data/public-snapshot.json';

  function assertNonNegativeCents(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Invalid public snapshot field: ' + label);
    }
  }

  function validate(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || snapshot.isDemo !== false) {
      throw new Error('Invalid public snapshot');
    }
    if (!snapshot.meta || snapshot.meta.currency !== 'TWD' ||
        snapshot.meta.effectiveStartDate !== '2026-11-01' ||
        snapshot.meta.allocationPercent !== 50) {
      throw new Error('Unexpected public accounting settings');
    }
    if (!snapshot.totals || !Array.isArray(snapshot.monthly) || !Array.isArray(snapshot.donations)) {
      throw new Error('Incomplete public snapshot');
    }
    for (const field of ['commissionCents', 'allocationCents', 'donationCents', 'balanceCents', 'thresholdCents']) {
      assertNonNegativeCents(snapshot.totals[field], 'totals.' + field);
    }
    if (snapshot.totals.thresholdCents !== 100000 ||
        typeof snapshot.totals.progress !== 'number' ||
        snapshot.totals.progress < 0 || snapshot.totals.progress > 1 ||
        typeof snapshot.totals.donationDue !== 'boolean') {
      throw new Error('Invalid public threshold state');
    }
    return snapshot;
  }

  async function load() {
    const url = new URL(PUBLIC_SNAPSHOT_PATH, document.baseURI);
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Public snapshot request failed: ' + response.status);
    return validate(await response.json());
  }

  window.CharityDataSource = { load };
})();
