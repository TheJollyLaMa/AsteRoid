// Public configuration only. Provider credentials are entered in the header.
window.DECENT_CONFIG = {
  version: '2.0.0', appName: 'Decent Voyager', subtitle: 'Galactic Gauntlet · fly, survive, collect',
  ens: { enabled: true, rpcUrl: 'https://ethereum-rpc.publicnode.com' },
  art: { titleIcon: './assets/brand/mandelblum-gate.png', ipfsIcon: null, walletIcon: null, titleEnds: ['[', ']'] },
  theme: { 'bg-1': '#080d20', 'bg-2': '#101b32', 'bg-3': '#211239', accent: '#56edff', 'accent-2': '#ff58ce', title: '#f4faff', text: '#e8f2ff', muted: '#adbdd7', 'title-font': 'ui-monospace, Menlo, monospace' },
  chain: { chainId: 8453, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] },
  voyager: { refereeUrl: '', chainId: 8453, testnetChainId: 84532, contracts: { addressesUrl: './js/chain/addresses.json' } },
  providers: { default: 'pinata', pinata: { uploadUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS' }, local: { apiUrl: 'http://127.0.0.1:5001' }, gateway: 'https://ipfs.io/ipfs/', ucanAuth: null },
  about: {
    title: 'Decent Voyager · Galactic Gauntlet',
    summary: 'Fly the Galactic Gauntlet: Sector I is the free ten-level voyage; Decent Pilots can unlock Sector II, guarded Supporter Vaults, victory stamps, and online arena rounds. Couch multiplayer is free. No wallet is needed to play levels 1–10.',
    sections: [
      { title: 'How to play', body: 'Arrows or WASD move. Space fires; Enter launches or continues. V switches overview / POV; P pauses; M mutes game effects; C toggles the CRT overlay. Fly through each sector, gather power-ups, and keep your ship alive.' },
      { title: 'Sectors I & II', body: 'Sector I spans levels 1–10 and is open to everyone. Sector II · Far Future spans levels 11–20 and unlocks for Decent Pilots who capture a tier-1 Supporter Vault in Ace mode. A captured tier-1 vault carries your campaign into Sector II after level 10.' },
      { title: 'Decent Pilots', body: 'Pilots are contributors on the public allowlist. Wallet actions and online paid rounds are reserved for these addresses; the browser check is only a convenience, while contracts and the referee remain authoritative. Not on the list? Ask to join through the DecentAgency Discord. Everyone can freely play levels 1–10.' },
      { title: 'Supporter Vault & prizes', body: 'A guarded Supporter Vault may appear in Ace mode for a Decent Pilot. Capture a vault to earn an eligible DecentMarket supporter prize voucher; queued prizes remain pending until claimed or released on-chain. Browse supporter listings at DecentMarket. Voucher claims require an explicit wallet action.' },
      { title: 'Multiplayer & arena', body: 'Play couch co-op or versus locally for free. Online arena rounds are for Decent Pilots and cost $10 USDC to join; surviving players share the pot under the referee and contract rules. Groups are capped at five ships; overflow players start a new group. Online play is unavailable until the arena contracts and referee are configured.' },
      { title: 'Victory stamps & flight logs', body: 'Decent Pilots may sign a flight log after a run to submit eligible victory stamps and supporter captures to the referee. Signing always requires a click. If the referee is offline, the signed log stays in a local retry outbox. The GitHub issue flow remains as a fallback.' },
      { title: 'Save to IPFS', body: 'Use the left IPFS orbit → App backups to save or restore the game’s validated progress snapshot, including campaign settings and retained victory records. Uploads are public, not encrypted: review before sharing. Your chosen provider and keys stay in your browser; credentials are memory-only for this tab. Keep the CID yourself and maintain your provider’s pin: acceptance is not proof of permanent storage. Restore replaces saved progress after explicit consent.' },
      { title: 'Mandelblum art', body: 'Mandelblum gate and space artwork by TheJollyLaMa, adapted from the BlenderBender / Mandelblum collection with the creator’s permission for this game. Small still images keep the voyage light; the page and header respect reduced-motion preferences.' },
      { title: 'Open source', body: 'Decent Voyager is an open-source game. The header reuses DecentHead 2.0.0; the stopped-by-default player reuses DBuskRadio 0.2.0. Their Apache-2.0 licenses, notices, and original-art attribution are retained in the vendor directories. Music and station rights remain separate. Report bugs or contribute through the project links.' }
    ]
  },
  links: [
    { label: 'GitHub · Decent Voyager', url: 'https://github.com/TheJollyLaMa/AsteRoid' },
    { label: 'Issues / flight reports', url: 'https://github.com/TheJollyLaMa/AsteRoid/issues' },
    { label: 'DecentAgency', url: 'https://github.com/TheJollyLaMa/DecentAgency' },
    { label: 'Ask to join · DecentAgency Discord', url: 'https://discord.gg/tkBfwT3YMN' },
    { label: 'DecentMarket · supporter listings', url: 'https://decentmarket.io' },
    { label: 'Canopy / ecosystem', url: 'https://github.com/TheJollyLaMa/DecentCanopy' },
    { label: 'DBusk radio', url: 'https://github.com/A-Decent-Agency/DBuskRadio' },
    { label: 'DecentHead source', url: 'https://github.com/TheJollyLaMa/DecentHead' }
  ],
  relatedDapps: [
    { label: 'DecentBusking', url: 'https://github.com/TheJollyLaMa/DecentBusking' },
    { label: 'DecentCanopy', url: 'https://github.com/TheJollyLaMa/DecentCanopy' },
    { label: 'DecentHead', url: 'https://github.com/TheJollyLaMa/DecentHead' }
  ],
  supporterDnft: null
};
