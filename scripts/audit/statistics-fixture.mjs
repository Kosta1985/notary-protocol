export const serviceStats = () => ({ windowDays: 30, totals: { page_view: 4, verification_started: 2, verification_valid: 1 }, daily: [{ day: '2026-09-05', page_view: 4, verification_started: 2, verification_valid: 1 }] });
export const affiliateStats = () => ({
  model: 'single_level_direct_product_referral', currency: 'usd', cash_payouts_enabled: false,
  passport_price_atomic: 200, direct_commission_atomic: 100,
  affiliates: { total: 1, active: 1 }, invitation_payloads: { total: 2, last_30d: 2 },
  attributions: { total: 1, reserved: 0, held: 0, qualified_direct_sales: 1, rejected: 0, reversed: 0 },
  commissions: { total: 1, pending: 1, earned: 0, held: 0, reversed: 0, paid: 0, pending_amount_atomic: 100, earned_amount_atomic: 0, paid_amount_atomic: 0 },
  conversions: { attribution_to_qualified_sale: 1 }
});
