// Public configuration only. Provider credentials are entered in the header.
window.DECENT_CONFIG = {
  version: '2.0.0', appName: 'Decent Voyager', subtitle: 'Galactic Gauntlet · fly, survive, collect',
  ens: { enabled: true, rpcUrl: 'https://ethereum-rpc.publicnode.com' },
  art: { titleIcon: './assets/brand/voyager-disc.png', ipfsIcon: null, walletIcon: null, titleEnds: ['[', ']'] },
  theme: { 'bg-1': '#080d20', 'bg-2': '#101b32', 'bg-3': '#0e2a36', accent: '#56edff', 'accent-2': '#7dff8c', title: '#f4faff', text: '#e8f2ff', muted: '#adbdd7', 'title-font': 'ui-monospace, Menlo, monospace' },
  chain: { chainId: 8453, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] },
  voyager: { refereeUrl: 'https://decent-voyager-referee.onrender.com', chainId: 8453, testnetChainId: 84532, contracts: { addressesUrl: './js/chain/addresses.json' } },
  providers: { default: 'pinata', pinata: { uploadUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS' }, local: { apiUrl: 'http://127.0.0.1:5001' }, gateway: 'https://ipfs.io/ipfs/', ucanAuth: null },
  about: {
    title: 'Decent Voyager · Galactic Gauntlet',
    summary: 'Fly the Galactic Gauntlet: Sector I is the free ten-level voyage; Decent Pilots can unlock Sector II, guarded Supporter Vaults, victory stamps, and online arena rounds. Couch multiplayer is free. No wallet is needed to play levels 1–10.'
  },
  links: [
    { label: 'GitHub · Decent Voyager', url: 'https://github.com/TheJollyLaMa/DecentVoyager' },
    { label: 'Issues / flight reports', url: 'https://github.com/TheJollyLaMa/DecentVoyager/issues' },
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
  // Decent Voyager Supporter DNFT. Leave null to show "coming soon" in the About.
  supporterDnft: {
    title: 'Decent Voyager v1.0.0 Supporter DNFT',
    image: 'brand/voyager-supporter-v1.png',
    contract: '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B',
    tokenId: '80',
    escrowAddress: '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d',
    listingId: '10',
    chain: { chainId: 8453, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] },
    marketUrl: 'https://thejollylama.github.io/DecentHead/supporter/buy.html?chainId=8453&escrow=0x31b07b83e99A9bdF379bf40225b8A80d3804C89d&listingId=10',
    paymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    expectedPriceAmount: '10000000'
  }
};
