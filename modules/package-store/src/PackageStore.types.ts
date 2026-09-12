export type StoreOutcome = 'none' | 'purchased' | 'restored' | 'cancelled' | 'pending' | 'unverified' | 'failed' | 'unavailable';
export type StoreSnapshot = Readonly<{
  revision: number;
  busy: boolean;
  product?: { id: string; title: string; price: string };
  ownership: 'unknown' | 'notOwned' | 'owned';
  outcome: StoreOutcome;
  entitlementIssue: StoreOutcome;
  catalogIssue: StoreOutcome;
}>;
