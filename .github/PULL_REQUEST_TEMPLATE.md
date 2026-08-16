<!-- Thanks for contributing! Keep PRs focused — one feature or fix each. -->

## What does this change?

<!-- A short description, and the "why" behind it. Link an issue if there is one. -->

## Checklist

- [ ] `npm test` and `npm run typecheck` pass
- [ ] Added or updated tests for new logic (especially anything in `src/core/`)
- [ ] Updated `CHANGELOG.md` under `[Unreleased]` if this is user-visible
- [ ] No real financial data, personal information, or credentials in the diff
- [ ] No new **runtime** dependencies

## If this touches money, dates, or storage

- [ ] Money out stays negative; no float equality on amounts
- [ ] Transactions bucket by **effective** date, not posting date
- [ ] Persistence still goes only through `src/store/index.ts`
- [ ] Existing imports, manual edits, and learned rules survive (no silent data loss)

## How did you verify it?

<!-- Tests are great; say what you also checked in the browser, and any edge case you tried. -->
