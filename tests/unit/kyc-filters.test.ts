import { describe, expect, it } from 'vitest';

import { matchesDocumentStatus, matchesDocumentStatusFilters } from '../../src/app/dashboard/admin/providers/kyc/kyc-filters';

describe('KYC document status filters', () => {
  it('matches any_missing when any doc is missing', () => {
    expect(
      matchesDocumentStatus(
        { identity: 'missing', business: 'verified', bank: 'verified' },
        'any_missing',
      ),
    ).toBe(true);

    expect(
      matchesDocumentStatus(
        { identity: 'verified', business: 'verified', bank: 'verified' },
        'any_missing',
      ),
    ).toBe(false);
  });

  it('matches any_pending when any doc is pending', () => {
    expect(
      matchesDocumentStatus(
        { identity: 'verified', business: 'pending', bank: 'missing' },
        'any_pending',
      ),
    ).toBe(true);

    expect(
      matchesDocumentStatus(
        { identity: 'verified', business: 'verified', bank: 'missing' },
        'any_pending',
      ),
    ).toBe(false);
  });

  it('matchesDocumentStatusFilters returns true when any filter matches', () => {
    expect(
      matchesDocumentStatusFilters(
        { identity: 'verified', business: 'verified', bank: 'missing' },
        ['any_pending', 'bank_missing'],
      ),
    ).toBe(true);
  });
});
