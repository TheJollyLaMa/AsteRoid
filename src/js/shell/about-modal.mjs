// Decent Voyager About: replaces DecentHead's dropdown About before the header registers its own element.
const Base = globalThis.HTMLElement || class {};
const art = name => new URL(`../../assets/${name}`, import.meta.url).href;
const ZERO = '0x0000000000000000000000000000000000000000';
const ESCROW_ABI = [
  'function getListing(uint256) view returns (tuple(address nftContract,uint256 tokenId,uint256 priceETH,address priceToken,uint256 priceAmount,uint256 available,bool active,string note))',
  'function getNFTBalance(address,uint256) view returns (uint256)',
  'function purchaseWithETH(uint256,uint256) payable', 'function purchaseWithToken(uint256,uint256)',
];
const ERC20_ABI = ['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)'];

export const ABOUT = {
  tagline: 'Navigate the cosmic fabric. Every sector you clear is stamped into your flight record.',
  stats: [['20', 'levels across two sectors'], ['3', 'difficulties · Cadet → Ace'], ['5', 'ships per battle group']],
  mission: 'Decent Voyager is the DecentAgency arcade: an 8-bit gauntlet with modern firepower. Fly through drifting Mandelblum fields, blast the cores that shoot back, grab weapon upgrades, and survive to the end of each level. Cadet ends at level 10; Pilot and Ace continue through level 20, with no wallet or Supporter capture needed. Clear level 10 or 20 and the Mandelblum elephant escort salutes you. Decent Pilots fly for real rewards.',
  rewards: [
    { icon: '◈', title: 'Level 20 achievement NFT', body: 'Only completing level 20 on Pilot or Ace earns a new achievement NFT. Earlier levels keep their battle records and stats without minting an NFT. The final achievement carries the date, time, difficulty, telemetry and battle rendering; a full solo marathon also records all 20 levels. Cadet flights are practice only.', note: 'Queued after signing the flight log. It waits in ☥ → Rewards waiting each time you log in. Previously issued vouchers remain valid.' },
    { icon: '⬢', title: 'Guarded Supporter pickups', body: 'Whitelisted Pilot and Ace players find a guarded pickup near levels 9–10 and another near 19–20. Sector I offers DecentHead or DecentMarket; Sector II offers DecentCalendar, DecentCanopy or DecentPilgrimages. Destroy every guard and fly through the token.', note: 'Each capture refills health and records a reward, but is not required to reach levels 11–20. Transfers require funded custody and referee verification.' },
    { icon: '✦', title: 'Marathon and Perfect awards', body: 'Finish all 20 levels in one solo Ace run for a Voyager Supporter award. Perfect Ace also requires zero lives lost and both guarded pickups: earn the rare DecentBusking Supporter. Perfect Pilot uses the same full-run rules at Pilot difficulty: earn a BigNuten Supporter plus 100 BNut in one atomic claim. Cadets earn practice and confidence, not tokens.', note: 'The level-20 receipt records full-run stats and award references. References are not transfer receipts. The Voyager multi-asset escrow transfers the Perfect Pilot NFT and BNut together or reverts both. Limited reserves must be funded before rewards are claimable.' },
    { icon: '✶', title: 'Sector II · Far Future', body: 'Clear level 10 on Pilot or Ace and automatically warp into levels 11–20, a further-future sector with new Mandelblums and wilder weapons: Prism Splitter, Singularity, and a brighter Nova. Guest flights continue too; Cadet ends at level 10.', note: 'Your progress saves locally and can be backed up to IPFS.' },
    { icon: '⚔', title: 'Arena pot', body: 'Online battles cost $10 USDC per pilot. Every pilot who makes it to the end splits the pot. Pilots who go down forfeit their entry to the survivors.', note: 'Couch battles on one screen are always free.' },
  ],
  school: [
    { key: '←↑→↓ / WASD', text: 'Fly. On the start screen ↑/↓ picks a difficulty. Every new voyage starts at level 1; game over ends the run, not just the level.' },
    { key: 'Space', text: 'Fire. Hold for continuous fire.' },
    { key: 'B · hold', text: 'Charge the Nova cannon, then release for a big blast.' },
    { key: 'E', text: 'Cycle collected weapons. On a phone use Next weapon; hold Fire to keep shooting. Tilt is optional and requires permission.' },
    { key: 'V', text: 'Switch between the overview map and the cockpit POV, where the field rushes toward you.' },
    { key: 'P · M · C', text: 'Pause, mute, and toggle the CRT glow.' },
    { key: '🎮', text: 'Gamepads sync automatically. Press A to join; stick to fly, A to fire, B to charge.' },
  ],
  pickups: [
    { img: 'brand/voyager-disc.png', text: 'Fly through glowing capsules for upgrades: S Spread Cannon, R Rapid Laser, P Plasma Lance, O Shield.' },
    { img: 'vendor-breathe', text: 'The breathing ENS·ETH emblem refills your power bar.' },
    { img: 'game/white-lotus-clear.png', text: 'The spinning, glowing White Lotus grants one extra life to the collecting ship, with an original arcade fanfare and +1-life light show. Find one in levels 3, 7, 12 and 16 for a second chance.' },
    { img: 'game/mini-emblem-sheet.png', sheet: true, text: 'The spinning Mini emblem flies down at you in levels 5, 9, 14 and 18. Catch it to shrink your ship to half size; five hits bring you back to full size. Hits still cost power, shield-blocked hits do not count, and losing a life ends Mini mode.' },
    { img: null, text: 'Orange cores shoot back. Clear them before the gauntlet reaches you.' },
  ],
  couch: [
    'On the start screen choose Multiplayer battle → Same screen.',
    'Pick Co-op (one team) or Versus (individual scores), a difficulty, and 2–5 ships.',
    'Each extra pilot presses A on a gamepad, or shares the keyboard.',
    'Launch. Ships shrink a little when three or more fly together.',
  ],
  online: [
    { title: 'Connect', text: 'Click the fox in the header. Online rounds are for Decent Pilots on the DecentAgency list.' },
    { title: 'Choose', text: 'Start screen → Multiplayer battle → Online round. Pick Co-op or Versus and a difficulty.' },
    { title: 'Pair up', text: 'Random pairing joins the next open round or opens a new one. Invite wallets locks the round to the addresses or ENS names you list. Join by round # uses an ID a friend shared.' },
    { title: 'Pay in', text: 'Approve $10 USDC on Base and join the round, then sign a free session message. Your wallet shows every step.' },
    { title: 'Launch', text: 'The pilot who opened the round presses Start when everyone is in. Up to five ships fly per group; extra pilots start a new group.' },
    { title: 'Survive', text: 'Reach the end alive and claim your share with Claim payout. If a round expires before launch, Claim refund returns your $10.' },
  ],
  pilots: 'Wallet features (level 20 achievement NFTs, Supporter Vaults, Sector II rewards and online rounds) are open to whitelisted DecentAgency collaborators, the Decent Pilots. Not on the list yet? Ask in the DecentAgency Discord. Local play stays free: Cadet has 10 levels; Pilot and Ace have 20, with or without a wallet.',
  saving: 'Your progress lives in this browser even without a wallet. Before launching, the game reminds you to connect for rewards. The larger wallet orb turns green when connected; Pilot difficulty alone does not mean your wallet is a Decent Pilot. Reward flights wait for Pilot verification and a referee ticket. Captured Supporter DNFTs show their metadata artwork, name, project and Canopy links in a briefing. Local play pauses; the online referee continues. A capture is not a transfer: sign the flight log at victory or game over, then claim the verified, funded reward from the rewards panel. Use the larger left IPFS orb to back up or restore progress with your own pinning provider. Connecting does not automatically pin stats. IPFS is public, so only game progress is exported.',
  recovery: 'Busy battles reduce cosmetic load without removing hazards. Glow sprites use a bounded, reusable cache, and HUD and win-screen text uses a built-in pixel font snapped to your screen’s pixels, so it stays sharp and changing scores create no new graphics surfaces. A long stall pauses solo/local play; use P, the mobile Pause/resume control, or Resume battle below the game. Online rounds continue on the referee. Close-up hit glints are subdued and full-screen flashes are replaced with edge pulses. Graphics loss releases cached surfaces; when the browser restores graphics the game redraws by itself at reduced resolution and stays paused until you press P or Resume battle. The warning strip above the game shows only a problem happening right now; earlier visits stay listed in Flight reports.',
  diagnostics: 'Flight reports & recovery below the game lets you download a bounded local report with the build/ruleset, recent errors, stack locations, battle state, entity counts, canvas size and graphics-resource samples every 15 seconds of active play. Cache counts, allocation totals and estimated surface bytes help diagnose gradual growth; these are not measurements of actual GPU memory or utilization. Reports survive reloads when browser storage is available. Wallet addresses, signatures, pinning credentials, replay inputs and save data are not collected. Nothing is sent automatically; review the JSON before sharing it with a Flight reports issue. If graphics do not recover, download first, then reload.',
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const safe = value => { try { const url = new URL(value, location.href); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const chips = items => (items || []).map(item => safe(item.url) ? `<a class="chip" href="${esc(safe(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.label)}</a>` : '').join('');

const STYLE = `
:host { --blue:#56edff; --green:#7dff8c; --gold:#ffe65c; --silver:#c9d6e3; --ink:#e8f2ff; --muted:#9fb4c8; }
dialog { box-sizing:border-box; width:min(1080px,calc(100vw - 24px)); max-height:calc(100dvh - 24px); padding:0; border:1px solid #56edff55; border-radius:24px; color:var(--ink);
  background:radial-gradient(ellipse at 80% -10%,#123a4a 0,transparent 55%),radial-gradient(ellipse at -10% 90%,#0f3326 0,transparent 50%),#060b18;
  box-shadow:0 0 0 1px #c9d6e318,0 30px 120px #000d,0 0 80px #56edff1c; font:15px/1.7 system-ui,-apple-system,'Segoe UI',sans-serif; overflow:auto; overscroll-behavior:contain; }
dialog[open] { animation:rise .45s cubic-bezier(.2,.8,.2,1); }
dialog::backdrop { background:#01040bcc; backdrop-filter:blur(6px); }
.close { position:sticky; top:14px; float:right; margin:14px 14px 0 0; z-index:3; width:42px; height:42px; border-radius:50%; border:1px solid #c9d6e366; background:#0b1428e6; color:var(--ink); font-size:22px; cursor:pointer; }
.close:hover { border-color:var(--gold); color:var(--gold); }
:focus-visible { outline:2px solid var(--gold); outline-offset:3px; }
.hero { position:relative; display:grid; grid-template-columns:minmax(0,1fr) 260px; gap:40px; align-items:center; padding:64px 64px 40px; overflow:hidden; }
.hero::before { content:''; position:absolute; inset:0; pointer-events:none; opacity:.5; background-image:radial-gradient(#c9e9ff 1px,transparent 1.4px),radial-gradient(#7dff8c 1px,transparent 1.4px); background-size:73px 73px,121px 121px; background-position:9px 17px,41px 53px; animation:twinkle 6s ease-in-out infinite; }
.eyebrow { font:700 11px/1 ui-monospace,Menlo,monospace; letter-spacing:.3em; color:var(--green); text-transform:uppercase; }
h1 { margin:14px 0 10px; font:800 clamp(34px,6vw,62px)/1.02 ui-monospace,Menlo,monospace; letter-spacing:-.01em;
  background:linear-gradient(100deg,#ffffff 0%,var(--silver) 30%,var(--blue) 60%,var(--green) 100%); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 0 22px #56edff40); }
.tagline { font-size:19px; color:#d6e6f5; max-width:34ch; margin:0; }
.stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:30px; max-width:520px; }
.stat { padding:12px 14px; border:1px solid #c9d6e330; border-radius:14px; background:#0b1630b3; }
.stat b { display:block; font:800 28px/1 ui-monospace,Menlo,monospace; color:var(--gold); }
.stat span { font-size:12px; color:var(--muted); }
.disc { position:relative; width:240px; aspect-ratio:1; justify-self:center; }
.disc img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; animation:spin 40s linear infinite; filter:drop-shadow(0 0 30px #56edff70) drop-shadow(0 0 60px #7dff8c30); }
.disc::after { content:''; position:absolute; inset:-16px; border-radius:50%; border:1px dashed #ffe65c55; animation:spin 60s linear infinite reverse; }
section { padding:40px 64px; border-top:1px solid #c9d6e314; animation:fade .6s both; }
section:nth-of-type(2) { animation-delay:.05s } section:nth-of-type(3) { animation-delay:.1s } section:nth-of-type(4) { animation-delay:.15s }
h2 { margin:0 0 22px; font:800 13px/1 ui-monospace,Menlo,monospace; letter-spacing:.28em; text-transform:uppercase; color:var(--blue); display:flex; align-items:center; gap:14px; }
h2::after { content:''; flex:1; height:1px; background:linear-gradient(90deg,#56edff55,transparent); }
p { margin:0 0 14px; } .lead { font-size:17px; color:#d6e6f5; max-width:70ch; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:18px; }
.card { position:relative; padding:24px; border:1px solid #c9d6e324; border-radius:18px; background:linear-gradient(160deg,#0e1d36d9,#08111fd9); transition:transform .25s,border-color .25s,box-shadow .25s; }
.card:hover { transform:translateY(-3px); border-color:#56edff70; box-shadow:0 12px 40px #0008,0 0 24px #56edff18; }
.card .icon { font:800 26px/1 ui-monospace,Menlo,monospace; color:var(--gold); text-shadow:0 0 14px #ffe65c80; }
.card h3 { margin:14px 0 8px; font-size:17px; color:#fff; }
.card p { font-size:14px; color:#c3d3e3; }
.card small { display:block; margin-top:12px; padding-top:12px; border-top:1px dashed #c9d6e328; color:var(--green); font-size:12.5px; }
.keys { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px 28px; }
.key { display:flex; gap:16px; align-items:baseline; }
kbd { flex:none; min-width:112px; text-align:center; padding:6px 10px; border:1px solid #c9d6e355; border-bottom-width:3px; border-radius:9px; background:#0b1630; font:700 12px ui-monospace,Menlo,monospace; color:var(--gold); }
.pickups { display:flex; flex-wrap:wrap; gap:14px; margin-top:22px; }
.pickup { flex:1 1 240px; display:flex; gap:12px; align-items:center; padding:12px 14px; border-radius:14px; background:#0b1630a8; border:1px solid #7dff8c2a; font-size:13.5px; color:#c3d3e3; }
.pickup img { width:34px; height:34px; object-fit:contain; } .pickup img.sheet { object-fit:cover; object-position:0 50%; animation:about-sheet 1s steps(12, jump-none) infinite; }
@keyframes about-sheet { to { object-position:100% 50%; } }
.pickup .dot { width:14px; height:14px; margin:0 10px; border-radius:50%; background:#fff1c2; box-shadow:0 0 12px 5px #ff5a1c; flex:none; }
.modes { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.5fr); gap:22px; }
.track { padding:26px; border-radius:18px; border:1px solid #c9d6e324; background:#0a1428c0; }
.track h3 { margin:0 0 4px; font-size:18px; } .track .price { font:700 12px ui-monospace,Menlo,monospace; letter-spacing:.12em; color:var(--green); text-transform:uppercase; }
.track.online .price { color:var(--gold); }
ol { list-style:none; counter-reset:step; margin:18px 0 0; padding:0; }
ol li { counter-increment:step; position:relative; padding:0 0 18px 48px; font-size:14px; color:#c3d3e3; }
ol li::before { content:counter(step); position:absolute; left:0; top:-2px; width:30px; height:30px; display:grid; place-items:center; border-radius:50%; font:800 13px ui-monospace,Menlo,monospace; color:#04101a; background:linear-gradient(135deg,var(--blue),var(--green)); box-shadow:0 0 14px #56edff55; }
ol li:not(:last-child)::after { content:''; position:absolute; left:14.5px; top:30px; bottom:2px; width:1px; background:#56edff40; }
.online ol li::before { background:linear-gradient(135deg,var(--gold),var(--green)); box-shadow:0 0 14px #ffe65c55; }
ol li strong { color:#fff; display:block; }
.supporter { display:grid; grid-template-columns:200px minmax(0,1fr); gap:32px; align-items:center; padding:30px; border-radius:22px; border:1px solid #ffe65c55;
  background:radial-gradient(ellipse at 0 50%,#ffe65c14,transparent 60%),linear-gradient(140deg,#121c30,#0a1422); box-shadow:inset 0 0 40px #ffe65c0c; }
.token { position:relative; aspect-ratio:1; border-radius:20px; display:grid; place-items:center; background:radial-gradient(circle,#173248,#070d18 70%); border:1px solid #c9d6e340; overflow:hidden; }
.token img { width:78%; filter:drop-shadow(0 0 22px #ffe65c66); animation:float 5s ease-in-out infinite; }
.token.card-art img { width:100%; border-radius:18px; filter:drop-shadow(0 0 18px #5ad8ff55); }
.token::after { content:''; position:absolute; inset:0; background:linear-gradient(115deg,transparent 35%,#ffffff22 50%,transparent 65%); animation:sheen 4.5s ease-in-out infinite; }
.badge { display:inline-block; padding:5px 12px; border-radius:99px; font:800 11px/1 ui-monospace,Menlo,monospace; letter-spacing:.2em; text-transform:uppercase; color:#04101a; background:var(--gold); box-shadow:0 0 18px #ffe65c66; }
.badge.live { background:var(--green); box-shadow:0 0 18px #7dff8c66; }
.supporter h3 { margin:14px 0 8px; font-size:24px; }
.buy { margin-top:8px; padding:13px 26px; border:0; border-radius:12px; cursor:pointer; font:800 15px system-ui; color:#04101a; background:linear-gradient(120deg,var(--gold),var(--green)); box-shadow:0 8px 30px #7dff8c33; }
.buy:disabled { opacity:.5; cursor:wait; }
.quiet { font-size:12.5px; color:var(--muted); overflow-wrap:anywhere; }
.duo { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:22px; }
.panel { padding:24px; border-radius:18px; border:1px solid #c9d6e324; background:#0a1428a8; }
.panel h3 { margin:0 0 10px; font-size:16px; color:#fff; } .panel p { font-size:14px; color:#c3d3e3; margin:0; }
.chips { display:flex; flex-wrap:wrap; gap:10px; }
.chip { padding:9px 15px; border-radius:99px; border:1px solid #56edff45; color:#dff6ff; text-decoration:none; font-size:13.5px; background:#0b1630; transition:border-color .2s,color .2s; }
.chip:hover { border-color:var(--gold); color:var(--gold); }
footer { padding:28px 64px 40px; text-align:center; font-size:12.5px; color:var(--muted); border-top:1px solid #c9d6e314; }
@keyframes spin { to { transform:rotate(360deg); } }
@keyframes float { 50% { transform:translateY(-8px) rotate(4deg); } }
@keyframes sheen { 0%,60% { transform:translateX(-100%); } 100% { transform:translateX(100%); } }
@keyframes twinkle { 50% { opacity:.25; } }
@keyframes fade { from { opacity:0; transform:translateY(14px); } }
@keyframes rise { from { opacity:0; transform:translateY(24px) scale(.98); } }
@media (max-width:760px) { .hero { grid-template-columns:1fr; padding:56px 22px 28px; gap:24px; } .disc { width:170px; grid-row:1; } section { padding:30px 22px; } footer { padding:24px 22px 32px; } .modes,.supporter { grid-template-columns:1fr; } .supporter { padding:22px; } .token { max-width:200px; } kbd { min-width:92px; } }
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none !important; transition:none !important; } }
`;

export class VoyagerAbout extends Base {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  connectedCallback() { this.render(); }
  open() { this.render(); this.shadowRoot.querySelector('dialog').showModal(); this.shadowRoot.querySelector('dialog').scrollTop = 0; void this.refreshListing(); }
  close() { this.shadowRoot.querySelector('dialog')?.close(); }
  render() {
    const config = window.DECENT_CONFIG || {}, supporter = config.supporterDnft;
    const listed = !!(supporter && supporter.escrowAddress && supporter.listingId !== undefined && supporter.contract);
    const breathe = art('../vendor/decent-head/2.0.0/img/Ens_Eth_Breathe.png');
    const tokenTitle = supporter?.title || 'Decent Voyager Supporter DNFT';
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><dialog aria-labelledby="about-title">
      <button class="close" type="button" aria-label="Close">×</button>
      <div class="hero"><div>
        <div class="eyebrow">DecentAgency · Galactic Gauntlet</div>
        <h1 id="about-title">Decent Voyager</h1>
        <p class="tagline">${esc(ABOUT.tagline)}</p>
        <div class="stats">${ABOUT.stats.map(([value, label]) => `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('')}</div>
      </div><div class="disc" aria-hidden="true"><img src="${esc(art('brand/voyager-disc.png'))}" alt=""></div></div>
      <section aria-labelledby="mission"><h2 id="mission">The mission</h2><p class="lead">${esc(ABOUT.mission)}</p></section>
      <section aria-labelledby="rewards"><h2 id="rewards">What you earn</h2><div class="grid">
        ${ABOUT.rewards.map(item => `<article class="card"><div class="icon" aria-hidden="true">${esc(item.icon)}</div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><small>${esc(item.note)}</small></article>`).join('')}
      </div></section>
      <section aria-labelledby="school"><h2 id="school">Flight school</h2>
        <div class="keys">${ABOUT.school.map(item => `<div class="key"><kbd>${esc(item.key)}</kbd><span>${esc(item.text)}</span></div>`).join('')}</div>
        <div class="pickups">${ABOUT.pickups.map(item => `<div class="pickup">${item.img === 'vendor-breathe' ? `<img src="${esc(breathe)}" alt="">` : item.img ? `<img${item.sheet ? ' class="sheet"' : ''} src="${esc(art(item.img))}" alt="">` : '<span class="dot" aria-hidden="true"></span>'}<span>${esc(item.text)}</span></div>`).join('')}</div>
      </section>
      <section aria-labelledby="multiplayer"><h2 id="multiplayer">Multiplayer walkthrough</h2><div class="modes">
        <div class="track"><h3>Same screen</h3><div class="price">Free · 2–5 ships</div><ol>${ABOUT.couch.map(step => `<li>${esc(step)}</li>`).join('')}</ol></div>
        <div class="track online"><h3>Online round</h3><div class="price">$10 USDC · winners split the pot</div><ol>${ABOUT.online.map(step => `<li><strong>${esc(step.title)}</strong>${esc(step.text)}</li>`).join('')}</ol></div>
      </div></section>
      <section aria-labelledby="support"><h2 id="support">Support the voyage</h2><div class="supporter">
        <div class="token${listed && supporter.image ? ' card-art' : ''}"><img src="${esc(art(listed && supporter.image ? supporter.image : 'brand/voyager-disc.png'))}" alt="Decent Voyager supporter token art"></div>
        <div><span class="badge ${listed ? 'live' : ''}">${listed ? 'Available now' : 'Coming soon'}</span>
          <h3>${esc(tokenTitle)}</h3>
          <p>${listed ? 'Back Decent Voyager directly. The token is held in the DecentMarket escrow on Base and transfers to your wallet when you buy.' : 'The Decent Voyager Supporter DNFT is being minted. Supporters fund new sectors, weapons, and arena prizes, and join the DecentAgency payroll family. It will be purchasable right here when it lands.'}</p>
          ${listed ? `<p class="quiet" id="listing">Checking the escrow listing…</p><button class="buy" id="buy" type="button">Buy supporter DNFT</button>` : `<p class="quiet">Until then you can win Supporter tokens from DecentHead, DecentMarket, DecentBusking, BigNuten, DecentCanopy, and Decent Pilgrimages in Ace-mode vaults.</p>`}
          ${listed && safe(supporter.marketUrl) ? `<p style="margin-top:16px"><a class="chip" href="${esc(safe(supporter.marketUrl))}" target="_blank" rel="noopener noreferrer">View on DecentMarket</a></p>` : ''}
          <p class="quiet" id="purchase-status" role="status" aria-live="polite"></p>
        </div></div></section>
      <section aria-labelledby="pilots"><h2 id="pilots">Pilots &amp; your data</h2><div class="duo">
        <div class="panel"><h3>Decent Pilots</h3><p>${esc(ABOUT.pilots)}</p></div>
        <div class="panel"><h3>Save to IPFS</h3><p>${esc(ABOUT.saving)}</p></div>
      </div></section>
      <section aria-labelledby="recovery"><h2 id="recovery">Performance &amp; flight reports</h2>
        <p>${esc(ABOUT.recovery)}</p><p>${esc(ABOUT.diagnostics)}</p>
        <p class="quiet">White Lotus lives do not erase lives lost for Perfect awards. Game over starts a fresh level-1 voyage; saved best scores and historical battle records remain. Phone controls work without a wallet; actual MetaMask/iPhone testing is device-specific.</p>
      </section>
      <section aria-labelledby="links"><h2 id="links">Project links</h2><div class="chips">${chips(config.links)}${chips(config.relatedDapps)}</div></section>
      <footer>Mandelblum art by TheJollyLaMa · header by DecentHead · radio by DBuskRadio · open source.<br>Your wallet. Your flight. Your choice.</footer>
    </dialog>`;
    const dialog = this.shadowRoot.querySelector('dialog');
    this.shadowRoot.querySelector('.close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    for (const type of ['keydown', 'keyup']) dialog.addEventListener(type, event => { if (event.key !== 'Escape') event.stopPropagation(); });
    this.shadowRoot.querySelector('#buy')?.addEventListener('click', () => void this.buy());
  }
  status(message) { const node = this.shadowRoot.querySelector('#purchase-status'); if (node) node.textContent = message; }
  async ethers() { return window.ethers || (await import('../../vendor/decent-head/2.0.0/js/wallet.js')).loadEthers(); }
  async refreshListing() {
    const cfg = window.DECENT_CONFIG?.supporterDnft, label = this.shadowRoot.querySelector('#listing');
    if (!label || !cfg) return;
    try {
      const ethers = await this.ethers(), rpc = cfg.chain?.rpcUrls?.[0] || window.DECENT_CONFIG?.chain?.rpcUrls?.[0];
      const escrow = new ethers.Contract(cfg.escrowAddress, ESCROW_ABI, new ethers.JsonRpcProvider(rpc));
      const listing = await escrow.getListing(cfg.listingId);
      if (!listing.active || listing.available < 1n) { label.textContent = 'Sold out for now. Check back soon.'; this.shadowRoot.querySelector('#buy').disabled = true; return; }
      let price = `${ethers.formatEther(listing.priceETH)} ETH`;
      if (listing.priceETH === 0n) {
        const tokenAddress = listing.priceToken === ZERO ? cfg.paymentToken : listing.priceToken;
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, escrow.runner);
        const [decimals, symbol] = await Promise.all([token.decimals(), token.symbol()]);
        price = `${ethers.formatUnits(listing.priceAmount, decimals)} ${symbol}`;
      }
      label.textContent = `${price} · ${listing.available} available on Base`;
    } catch { label.textContent = 'Listing details are unavailable right now; the purchase step re-checks escrow before you sign.'; }
  }
  async buy() {
    const cfg = window.DECENT_CONFIG?.supporterDnft, button = this.shadowRoot.querySelector('#buy');
    if (!cfg || this.busy) return;
    this.busy = true; button.disabled = true;
    try {
      const wallet = window.DecentHead?.getWallet?.();
      if (!wallet) throw new Error('Wallet is unavailable. Reload and try again.');
      if (!wallet.snapshot().connected) await wallet.connect();
      const provider = await wallet.ensureChain(cfg.chain || window.DECENT_CONFIG.chain);
      const ethers = await this.ethers(), signer = await provider.getSigner();
      const escrow = new ethers.Contract(cfg.escrowAddress, ESCROW_ABI, signer);
      this.status('Checking the listing and escrow stock…');
      const listing = await escrow.getListing(cfg.listingId);
      if (listing.nftContract.toLowerCase() !== cfg.contract.toLowerCase() || listing.tokenId !== BigInt(cfg.tokenId)) throw new Error('This listing does not match the Decent Voyager supporter token.');
      if (!listing.active || listing.available < 1n || await escrow.getNFTBalance(cfg.contract, cfg.tokenId) < 1n) throw new Error('The supporter token is not available in escrow right now.');
      if (cfg.expectedPriceAmount !== undefined && (listing.priceETH !== 0n || listing.priceAmount !== BigInt(cfg.expectedPriceAmount))) throw new Error('The listing price changed. Reopen the About to review it.');
      let tx;
      if (listing.priceETH > 0n) {
        if (!window.confirm(`Buy one supporter DNFT for ${ethers.formatEther(listing.priceETH)} ETH? Review the transaction in your wallet.`)) { this.status('Cancelled.'); return; }
        tx = await escrow.purchaseWithETH(cfg.listingId, 1, { value: listing.priceETH });
      } else {
        const tokenAddress = listing.priceToken === ZERO ? cfg.paymentToken : listing.priceToken;
        if (!tokenAddress || tokenAddress === ZERO) throw new Error('The escrow payment token is not configured.');
        const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const [decimals, symbol] = await Promise.all([token.decimals(), token.symbol()]);
        if (!window.confirm(`Buy one supporter DNFT for ${ethers.formatUnits(listing.priceAmount, decimals)} ${symbol}? Review each wallet step.`)) { this.status('Cancelled.'); return; }
        const buyer = await signer.getAddress();
        if (await token.allowance(buyer, cfg.escrowAddress) < listing.priceAmount) {
          this.status(`Approve exactly ${ethers.formatUnits(listing.priceAmount, decimals)} ${symbol} in your wallet…`);
          await (await token.approve(cfg.escrowAddress, listing.priceAmount)).wait();
        }
        tx = await escrow.purchaseWithToken(cfg.listingId, 1);
      }
      this.status('Waiting for confirmation…');
      await tx.wait();
      this.status(`Welcome aboard, supporter! Transaction ${tx.hash}`);
    } catch (error) { this.status(error.shortMessage || error.message); }
    finally { this.busy = false; button.disabled = false; }
  }
}

if (globalThis.customElements && !customElements.get('about-modal')) customElements.define('about-modal', VoyagerAbout);
