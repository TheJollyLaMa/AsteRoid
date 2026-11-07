# Archived replay rulesets

`voyager-1.3-mini-emblem/` contains the exact simulation and its local dependency
closure from Decent Voyager commit
`3fe3375d4487ef1fe6ec9e6c78aa7737f2f9d3b7` (merged PR #16).
It was extracted with `git archive`, not adapted to the current campaign rules.
The source retains the repository's Apache-2.0 license.

These files are immutable replay evidence, not an alternate game to launch.
The referee selects this implementation only for flights and authenticated
server tickets that both identify `voyager-1.3-mini-emblem`. New tickets and
online arenas use the current game. Unknown rulesets, changed MACs, mismatched
ticket/run rulesets, expired tickets and tampered run summaries remain rejected.
The existing six-hour ticket lifetime is not extended.

The archive preserves the old capture-triggered Sector II unlock and level-10
ending. Applying today's rules to old input logs could change their ending,
captures and reward eligibility. Do not update these files when changing the
current game; explicitly archive another version only when needed.

Legacy `game.js` SHA-256:
`12ba23c1d7c35dd92b2f22fe8ee4aad21c4aa07ed6503d92b6736a5b394509ce`.

Recovery is not a transfer: a verified captured token still requires funded
custody and the player's separate Base claim transaction. The browser outbox
keeps the original signed run unchanged and retries it.
