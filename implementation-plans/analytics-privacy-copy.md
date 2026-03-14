# Analytics Privacy Copy Tightening

## Goal

Clarify analytics consent and privacy behavior in Settings without changing the product's opt-out analytics model.

## Approach

- Keep `settings.privacy.analyticsEnabled` as the single source of truth.
- Tighten the Privacy section copy to explain anonymous persistence, autocapture, disabled session recording, local-only preference storage, and opt-out behavior.
- Make the bootstrap entrypoints skip analytics startup events when analytics is already disabled.
- Update API key copy so it does not overstate client-side key storage.
- Add focused tests for privacy copy and disabled-on-load analytics behavior.

## Checklist

- [x] Review current Privacy section copy and analytics bootstrap behavior
- [x] Update Settings privacy copy and API key wording
- [x] Gate bootstrap analytics events on saved disabled state
- [x] Add focused tests for privacy copy and bootstrap consent behavior
- [x] Run targeted verification and record completion
