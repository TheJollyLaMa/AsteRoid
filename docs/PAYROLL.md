# Decent Voyager repository payroll

The generic bounty bot records **Base** repository-development accruals for owner-whitelisted workers. It never handles artists, radio plays, testing bounties, or automatic on-chain payouts. Only TheJollyLaMa is initially registered, with zero earnings and no issue history.

## Workflow

1. Ask the owner for direct onboarding via the **Contributor Whitelist Request** issue form. The alert mentions the owner on GitHub; it does not authorize or add a wallet.
2. Owner verifies GitHub identity and wallet ownership directly, then merges a reviewed `contributor-accounts.json` change with `whitelisted: true`, public wallet, displayName/role, empty issuesClosed, and zero ART/USDC `totalEarnedByCurrency` / `pendingBalanceByCurrency` maps. Do not self-register or publish private onboarding details.
3. Owner runs **Bounty Label** with issue number, positive decimal amount and ART or USDC. Labels use `bounty: 1.5 ART` or `bounty: 0.25 USDC`. One bounty per currency per issue; malformed/unsupported labels fail instead of guessing. ART ledger precision is 8 decimals, USDC 6; arithmetic uses integer units.
4. A whitelisted PR author merges a PR that **Closes/Fixes/Resolves #issue** (same repository), or uses GitHub's closing-issue links. The bot loads trusted main scripts, not PR code, verifies merged status, accrues the full bounty to the author, and commits the payroll/accounts ledgers. Deduplication is by repository issue, currency and implementer role across pending/settled. Bot comments are provisional until the ledger commit succeeds.
5. If onboarding or labels were missing, repair them and use **Bounty Bot → Run workflow** with the merged PR number and optional same-repo issue numbers. Manual recovery cannot queue an unmerged PR.
6. **Repo Workers** in the LEFT ankh admin panel displays whitelisted identities, wallets, earned/pending amounts and closed issues with public profile/issue links. It is read-only.

`payroll-queue.json` contains `pending` and `settled`. Each entry fixes Base chain, exact amount/currency, whitelisted recipient wallet, issue/PR identity and queue timestamp. `scripts/validatePayrollQueue.js` rejects duplicate semantic identities, wallet mismatches, unsupported precision and contributor pending balance drift. Wallet rotation while entries are pending requires a reviewed coordinated ledger repair; do not silently redirect payouts.

## Owner setup checklist (not changed automatically)

- Enable GitHub Actions and allow the built-in `GITHUB_TOKEN` **contents/issue write** permissions for the two queue workflows. Read-only checks and alert/label workflows have narrower permissions. No new PAT, wallet/private key, webhook or RPC secret is needed for this subset.
- Ensure the default/main branch permits the intended bot ledger updates. The workflows push only their named ledgers and share `asteroid-ledger-main` concurrency. They fail rather than automatically rebase conflicting manual edits; re-run after reviewing a conflict. If branch protection forbids bot direct pushes, replace the persistence step with an owner-reviewed PR flow before enabling writes.
- Create `victory-stamp` and `whitelist-request` labels so issue templates apply them. Bounty labels are created by the maintainer's workflow. Enable Issues and review who can edit bounty labels/run workflows.
- Require owner/code-owner reviews for `.github/**`, `scripts/**`, contributor/accounts, payroll/assets/config, victory queue and admin code. `.github/CODEOWNERS` names the owner; **branch protection must enforce it**. Review all automation changes before merge, especially under `pull_request_target`.
- Publish root JSON files on `main` for the browser's raw-file fetch, or host explicit copies. Do not publish private contributor onboarding information.
- Register additional workers only after direct approval. Initial config has `enabled: true` but `settlementEnabled: false`.

Read-only GitHub inspection on 2026-11-05 found no repository Actions secret names, only the standard nine issue labels, no open PRs, and issue #1 about supporter-release workflows. Consequently the two issue-template labels and write/protection settings still need owner setup. No remote settings, labels, issues or secrets were created by this implementation.

## Settlement intentionally excluded

`payroll-assets.json` records the donor Base ART/USDC identities as configuration, **not verified treasury integration**. It deliberately has `routerAddress: null` and `settlementEnabled: false`; `asteroid-repo-dev` is a legacy proposed ledger scope, not a deployed/funded fund or current product name. Do not reuse Busking's artist funds or shared router as if Voyager were funded. Settlements require separate owner-reviewed contract/asset/fund verification, funding, authorization and receipt reconciliation. No signing key, spending workflow or automatic transfer is installed.

This subset pays only the merged implementer's approved bounty; Busking's idea splits, retained credits, artist/radio payroll, testing bounties and settlement tooling are intentionally not transplanted. Existing same-repo accrual records are the source of truth; queueing does not promise available funds or a payment date.

## Referee supporter-prize entries

`payroll-queue.json` may also contain `kind: "supporter-prize"` entries created by the Decent Voyager referee. These carry the signed voucher, player, tier, project/token label, and run evidence; they are reviewed as collectible releases, not contributor-payment amounts. The validator checks their addresses, voucher fields, signatures, digests, timestamps, and duplicate player/token pairs, while excluding them from contributor balance accounting and settlement.
