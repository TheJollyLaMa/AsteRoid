# Decent Voyager referee and arena server

The Node 20 service in `server/` verifies signed run logs by replaying them through the shared game core, signs EIP-712 stamp/prize/settlement vouchers, writes pending entries to the repository queues, and hosts the `/arena` WebSocket lobby. Run locally with `cd server && npm install && npm test && npm start`.

## HTTP and WebSocket API

- `GET /health` — readiness and non-secret integration status.
- `POST /tickets` — JSON `{ "address": "0x…" }`; pilot wallets only. Returns `{ ticket: { id, address, seed, issuedAt, expiresAt }, mac }`, where `seed` is a cryptographically random uint32 and `mac` is HMAC-SHA256 over canonical ticket JSON. Tickets expire after six hours and are single-use. The run log must include the complete response as `run.ticket = { ticket, mac }`; the ticket address and seed must match the signing wallet and `run.seed`.
- `POST /runs` — JSON `{ "address": "0x…", "signature": "0x…", "run": { ...getRunLog() } }`. The wallet EIP-191-signs the hex text returned by `keccak256(UTF-8(canonical JSON run))` (matching the browser's `signer.signMessage(runHash)`); object keys are sorted recursively before hashing. The server verifies the address and pilot status, replays the frames, and issues vouchers/queues entries for replay-produced level records and captures. An optional run `result`/`summary` is compared with the replay result. Attach a PNG/JPEG/WebP `battleCard` data URL inside the signed run to pin an image as well as metadata. Repeated identical `runId`s return the original result; a conflicting reuse returns 409. Prize vouchers use `keccak256("<runId>:tier<N>")` as their voucher `runId`, so a run that captures both vaults gets two independently claimable prizes.
- `GET /vouchers/:address` — vouchers for that wallet from the persistent queues plus the in-process cache.
- `GET /arena/open?mode=coop|versus&difficulty=cadet|pilot|ace` — public, waiting paid rounds; either filter may be omitted. Returns `{ rounds: [{ paidRoundId, mode, difficulty, players, maxPlayers, createdAt }] }`. Invalid filter values return 400.
- `GET /arena/invites/:address` — invite-only paid rounds for the checksummed wallet address. Returns `{ address, invites: [{ paidRoundId, mode, difficulty, host, players, maxPlayers }] }`.
- `GET /queue` — admin-only pending stamp/prize queues. Send `x-admin-address`, `x-admin-timestamp` (Unix seconds), and `x-admin-signature`, an EIP-191 signature of `DecentVoyager admin queue\n{lowercase-address}\n{timestamp}`. Signatures expire after five minutes. `ADMIN_ADDRESS` is the allowlist; if omitted, contributor entries with `role: "owner"` or `role: "admin"` are accepted.
- `ws(s)://<host>/arena` — send `{type:"join", address, timestamp, nonce, signature, mode, difficulty, paidRoundId?, visibility?, invites?}`. Sign `DecentVoyager arena session\n{lowercase-address}\n{timestamp}\n{nonce}`. `visibility` may be `public` (default) or `invite`; for a new invite-only room, `invites` is an array of up to four wallet addresses. Existing-room settings are defined by the host. The server creates/reuses compatible lobbies with at most five ships per group (the sixth creates another); signed pilots send `{type:"input", input:{...}}` and the lobby host sends `{type:"start",seed}`. Inputs are simulated server-side at 60 Hz; state snapshots are broadcast at 30 Hz. A disconnect has a 10-second grace period before the ship is marked dead. Paid lobbies fail closed unless the configured arena contract's join-check view confirms that wallet joined that round. The default expected view is `hasJoined(uint256,address)`, configurable with `ARENA_JOINED_METHOD`.

`CORS_ORIGINS` is a comma-separated exact-origin allowlist. HTTP requests are rate-limited per source IP (defaults: 20/minute). WebSocket upgrades use the same origin list.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | Render supplies | HTTP and WebSocket listener port. |
| `REFEREE_PRIVATE_KEY` | Yes for signing | Dedicated referee signer; never log or commit it. |
| `TICKET_SECRET` | Yes in production | At least 32 bytes of private HMAC key material. Render generates it from `render.yaml`; local development uses a random per-process secret when omitted. Changing/restarting without the same secret invalidates previously issued tickets. |
| `CHAIN_ID` | Yes | EIP-712 domain chain ID (84532 Base Sepolia, 8453 Base). |
| `VOYAGER_ARENA_ADDRESS` | Paid settlement | EIP-712 verifying contract for `Settle`. |
| `VOYAGER_STAMPS_ADDRESS` | Stamp vouchers | EIP-712 verifying contract for `StampVoucher`. |
| `VOYAGER_PRIZES_ADDRESS` | Prize vouchers | EIP-712 verifying contract for `PrizeVoucher`. |
| `SUPPORTER_NFT_ADDRESS` | No | Prize NFT contract; defaults to the Base collection address. |
| `GITHUB_TOKEN` | Production queue | GitHub Contents API read/write token; without it the service uses local queue files. |
| `GITHUB_REPO` | With token | Queue/pilot source, e.g. `TheJollyLaMa/DecentVoyager`. |
| `GITHUB_REF` | No | Branch for Contents API (defaults to `main`). |
| `PILOTS_FILE` | No | Local contributor registry override for development. |
| `PINATA_JWT` | No | Pinata JWT; absence skips pinning and is reported in each run response. |
| `CORS_ORIGINS` | Production | Comma-separated exact browser origins; no wildcard matching. |
| `ADMIN_ADDRESS` | Recommended | Comma-separated admin wallet allowlist for `/queue`. |
| `BASE_RPC_URL` / `BASE_SEPOLIA_RPC_URL` | Paid rounds | Read-only RPC used to check on-chain round membership. |
| `ARENA_JOINED_METHOD` | No | Membership view name; defaults to `hasJoined`. |
| `ARENA_FINAL_LEVEL` | No | Last level before paid settlement (defaults to 10; valid range 1–20). |
| `RATE_LIMIT_MAX` | No | Requests per IP per window (default 20). |
| `RATE_LIMIT_WINDOW_MS` | No | Rate-limit window in milliseconds (default 60000). |

## Owner key-in checklist (Render)

The referee runs as its own Render service (`decent-voyager-referee`) in the same Render workspace as the other Decent services. It is deliberately not merged into DecentBusking's bot server: it replays runs with this repo's `src/js/game.js`, holds a prize-signing key, and must not share deploys or crashes with the radio.

1. **Referee wallet.** Create a fresh wallet used only for signing. It never needs funds. Keep its private key for step 4 and its address for the contract deploy (it is the `referee` on `VoyagerStamps`, `VoyagerPrizes` and `VoyagerArena`).
2. **Deploy contracts** on Base (see [CONTRACTS.md](CONTRACTS.md)) and note the three addresses.
3. **Create the service.** Render dashboard → **New → Blueprint** → pick `TheJollyLaMa/DecentVoyager` (branch `main`). Render reads `render.yaml`: `rootDir: server`, Node 20, Starter plan (always on), `/health`, `CHAIN_ID=8453`, `CORS_ORIGINS=https://thejollylama.github.io`, and a generated `TICKET_SECRET`.
4. **Paste the secrets** Render asks for:
   - `REFEREE_PRIVATE_KEY`: the step 1 key.
   - `GITHUB_TOKEN`: fine-grained token for `TheJollyLaMa/DecentVoyager` only, Contents read/write + Metadata read.
   - `VOYAGER_ARENA_ADDRESS`, `VOYAGER_STAMPS_ADDRESS`, `VOYAGER_PRIZES_ADDRESS`: from step 2.
   - `BASE_RPC_URL`: a Base mainnet RPC (e.g. Alchemy/Infura; `https://mainnet.base.org` works for light traffic).
   - `ADMIN_ADDRESS`: the admin wallet.
   - `PINATA_JWT` (optional): a limited key, only if the referee should pin battle cards.
   Add any extra game origins (an ENS gateway such as `https://<name>.eth.limo`) to `CORS_ORIGINS`, comma-separated, no `*`.
5. **Check it:** `curl https://decent-voyager-referee.onrender.com/health` (use the URL Render shows).
6. **Point the game at it:** set `voyager.refereeUrl` in `src/decent-head.config.js` to that URL, and the contract addresses in `src/js/chain/addresses.json`; commit. Online rounds and reward claims switch from "unavailable" to live.
7. **Verify** a signed pilot run, a queue append on GitHub, and that the EIP-712 domain (chain 8453 + contract address) matches each contract before announcing.

Cost: Starter is a fixed monthly fee per service. Review Render usage after the first month; if traffic is light, the referee can move onto a shared paid instance with other relays later (it only needs Node 20 and the repo checkout).

## Security and integration notes

- Server-issued flight tickets prevent clients from choosing seeds offline to grind for favorable gameplay. Tickets are HMAC-authenticated, pilot/address/seed-bound, expire after six hours, and may be redeemed once. Ticket use and run idempotency are in-memory only; a process restart forgets prior redemptions, so configure stable `TICKET_SECRET` and retain queue idempotency data.
- Replay verification is the anti-cheat boundary: client state and claimed results are not authoritative. The client signature proves who submitted the log, not that the log is fair; the referee recomputes results. Do not award from client-only fields.
- Compromise of `REFEREE_PRIVATE_KEY` permits forged vouchers and arena settlement signatures. Keep it separate from admin/deployer keys, rotate/revoke it through the contracts' authorized process, and monitor use.
- Pilot registry lookup fails closed. Production uses GitHub Contents when token/repo are set; local-file mode is intended for development. Queue writes deduplicate victory records across pending/minted and supporter player/token pairs across pending/settled, and reject a conflicting run hash or run ID; the queue's original voucher is returned on retry. The in-memory voucher history/idempotency cache is process-local.
- EIP-712 definitions are loaded from `src/js/chain/eip712.json` when it is present and must exactly match the `Settle`, `PrizeVoucher`, and `StampVoucher` contract fields; otherwise the server uses the team contract definitions. The domain name/version are `DecentVoyager`/`1`; set verifying contracts to the corresponding contracts.
- The browser integration must request `/tickets` before starting a replayable run, use the returned seed to initialize `Game`, attach `{ticket, mac}` to the completed run log before hashing/signing, and only then POST `/runs`. `server/src/game-adapter.js` is the only server dependency on evolving game APIs. It requires `Game.replay`, `setPilot`, `setPlayers`, fixed `step`, and `serialize` for authoritative multiplayer. Until core exports these, run submissions and arena starts fail with an explicit unavailable-API error; this server does not substitute a client-authoritative fallback.
- Paid rounds require a read-only membership view on the arena contract. The default ABI expects `hasJoined(roundId, player)`; coordinate the exact view name/signature with the chain worker before accepting paid rounds.
