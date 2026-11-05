// Public configuration only. Provider credentials are entered in the header.
window.DECENT_CONFIG = {
  version: '2.0.0', appName: 'AsteRoid', subtitle: 'Galactic Gauntlet · fly, survive, collect',
  ens: { enabled: true, rpcUrl: 'https://ethereum-rpc.publicnode.com' },
  art: { titleIcon: './assets/brand/mandelblum-gate.png', ipfsIcon: null, walletIcon: null, titleEnds: ['[', ']'] },
  theme: { 'bg-1': '#080d20', 'bg-2': '#101b32', 'bg-3': '#211239', accent: '#56edff', 'accent-2': '#ff58ce', title: '#f4faff', text: '#e8f2ff', muted: '#adbdd7', 'title-font': 'ui-monospace, Menlo, monospace' },
  chain: { chainId: 8453, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] },
  providers: { default: 'pinata', pinata: { uploadUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS' }, local: { apiUrl: 'http://127.0.0.1:5001' }, gateway: 'https://ipfs.io/ipfs/', ucanAuth: null },
  about: {
    title: 'AsteRoid · Galactic Gauntlet',
    summary: 'A ten-level, eight-bit space voyage with modern neon, Mandelblum portals, and optional Decent tools. No wallet is needed to play. Click the title whenever you need this flight manual.',
    sections: [
      { title: 'How to play', body: 'Arrows or WASD move. Space fires; Enter launches or continues. V switches overview / POV; P pauses; M mutes game effects; C toggles the CRT overlay. On the title screen, ← / → choose a level and ↑ / ↓ choose difficulty. Fly through all ten sectors, gather power-ups, and keep your ship alive.' },
      { title: 'Difficulties', body: 'Cadet is the welcoming original flight. Pilot is a tougher expedition with faster threats. Ace is the near-impossible gauntlet. Choose on the title screen before launching; saves retain your campaign and flight records.' },
      { title: 'Victory stamps', body: 'Each cleared level can become a DNFT victory stamp: full win stats and a rendered battle card are pinned to IPFS, then queued for admins to batch-mint on Base. Preparation, storage, and minting are separate opt-in steps. Minting is not instant or guaranteed; a wallet connection alone creates no collectible.' },
      { title: 'Save to IPFS', body: 'Use the left IPFS orbit → App backups to save or restore the game’s validated progress snapshot, including campaign settings and retained victory records. Uploads are public, not encrypted: review before sharing. Your chosen provider and keys stay in your browser; credentials are memory-only for this tab. Keep the CID yourself and maintain your provider’s pin: acceptance is not proof of permanent storage. Restore replaces saved progress after explicit consent.' },
      { title: 'Mandelblum art', body: 'Mandelblum gate and space artwork by TheJollyLaMa, adapted from the BlenderBender / Mandelblum collection with the creator’s permission for this game. Small still images keep the voyage light; the page and header respect reduced-motion preferences.' },
      { title: 'Open source', body: 'AsteRoid is an open-source game. The header reuses DecentHead 2.0.0; the stopped-by-default player reuses DBuskRadio 0.2.0. Their Apache-2.0 licenses, notices, and original-art attribution are retained in the vendor directories. Music and station rights remain separate. Report bugs or contribute through the project links above.' }
    ]
  },
  links: [
    { label: 'GitHub · AsteRoid', url: 'https://github.com/TheJollyLaMa/AsteRoid' },
    { label: 'Issues / flight reports', url: 'https://github.com/TheJollyLaMa/AsteRoid/issues' },
    { label: 'DecentAgency', url: 'https://github.com/TheJollyLaMa/DecentAgency' },
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
