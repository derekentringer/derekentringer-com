# 34 — Stripe Billing & Usage Tiers

**Status:** Planned
**Phase:** Phase 2 — Paid Tier Foundation
**Priority:** Critical (no revenue without this)
**Depends on:** Feature plan 30 (Branding)

## Summary

Integrate Stripe for subscription billing. Define free/personal/pro tiers with feature gating and usage limits. This is the monetization foundation.

## Tier Structure

| Feature | Free | Personal ($5/mo) | Pro ($10/mo) |
|---|---|---|---|
| Notes | 50 | Unlimited | Unlimited |
| Sync | Web only | Web + Desktop + Mobile | Web + Desktop + Mobile |
| Offline access | No | Yes | Yes |
| Image uploads | 100MB | 5GB | 20GB |
| AI completions | No | No | Unlimited |
| AI transcription | No | No | 60 min/month |
| AI Q&A / semantic search | No | No | Unlimited |
| Note sharing (public links) | No | 5 shared notes | Unlimited |
| Templates | Basic (3) | All | All |
| Priority support | No | No | Yes |
| Self-hosted option | — | — | $149 one-time |

### Annual Pricing
- Personal: $48/year (save 20%)
- Pro: $96/year (save 20%)

## Implementation

### Stripe Integration

**API side (`packages/ns-api/`):**
- `src/routes/billing.ts` — Stripe webhook handler, subscription status endpoints
- `src/services/stripeService.ts` — create customer, create checkout session, manage subscriptions
- `src/middleware/tierGate.ts` — middleware that checks user's tier before allowing actions
- Database: add `tier`, `stripeCustomerId`, `stripeSubscriptionId`, `tierExpiresAt` to User model

**Web side (`packages/ns-web/`):**
- `src/pages/BillingPage.tsx` — current plan, upgrade/downgrade, invoices, cancel
- `src/components/UpgradePrompt.tsx` — shown when hitting tier limits ("Upgrade to Pro for AI features")
- Stripe Checkout redirect for payment (no custom payment form needed)
- Stripe Customer Portal for managing subscription

**Env vars:**
- `STRIPE_SECRET_KEY` — API key
- `STRIPE_WEBHOOK_SECRET` — webhook signature verification
- `STRIPE_PRICE_ID_PERSONAL_MONTHLY`, `STRIPE_PRICE_ID_PERSONAL_ANNUAL`
- `STRIPE_PRICE_ID_PRO_MONTHLY`, `STRIPE_PRICE_ID_PRO_ANNUAL`

### Feature Gating

- Check `user.tier` on API endpoints before allowing actions
- Note count limit: reject `POST /sync/push` for note creation when at limit
- AI endpoints: return 403 with upgrade message for free/personal users
- Image upload: check cumulative storage before accepting
- Client shows upgrade prompts instead of disabled buttons

### Webhook Events to Handle

- `checkout.session.completed` — activate subscription
- `customer.subscription.updated` — tier change
- `customer.subscription.deleted` — downgrade to free
- `invoice.payment_failed` — grace period, then downgrade

## Verification

- Free user can create up to 50 notes, blocked on 51st
- Free user sees upgrade prompt when trying AI features
- Stripe Checkout flow completes and activates subscription
- Tier change reflects immediately in the app
- Cancellation downgrades to free at end of billing period
- Webhook handles all subscription lifecycle events
- Annual vs monthly pricing works correctly
