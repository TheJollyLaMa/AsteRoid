const { PRIZES, MARATHON_PRIZE, PERFECT_PRIZES, COLLECTION } = require('./prizes');

const IMAGE_CIDS = {
    70: 'QmcuhKLo46hwSdUQJm93VoHeB1YrpjhzeySg6Q7D9srabS',
    71: 'QmU7GmcRdWvJTvzkUKzEB6hsVrqX2jkFKyNq5sBusUR1wx',
    75: 'QmbMAoxqif263UUQmZPwNaaxaXycRKGCBf7rGe3kTAuzDe',
    76: 'QmUxzh27UCCjWS4no76P2rHm6mTA4wK2YrhQz3avR3eBWb',
    77: 'QmTaSEext8djzyBK2Wip22UQusL3aRpgNWbFiKrvjmSuWX',
    78: 'QmYtVkkDitdTnEabaZxPG8oquuenpWdVSzQ6b9VqbNrrVf',
    79: 'QmSrWH6EcmXsPfjfTa99G3D2xCqgXWSyLK6o5B1m7Smu3A',
    80: 'QmRBdBUg73Cd3y1aAzTT6jVgcRaVbw3roPpb4KaCrVqxce'
};
const PURPOSES = {
    DecentHead: 'A reusable Decent header with wallet connection, IPFS tools and project information.',
    DecentMarket: 'The Decent ecosystem marketplace for project Supporter DNFTs.',
    DecentCalendar: 'Calendar and scheduling tools in the Decent ecosystem.',
    DecentPilgrimages: 'A Decent project for pilgrimage and journey participation.',
    DecentCanopy: 'Explore projects, creators, funding relationships and useful next steps across the ecosystem.',
    DecentBusking: 'Music participation, scheduled radio and accountable creator earnings.',
    BigNuten_Vanilla: 'Body-care and wellness participation with user-owned data and rewards.',
    DecentVoyager: 'The Mandelblum arcade gauntlet, Supporter captures and twenty-level voyages.'
};
const prizes = [...PRIZES[1], ...PRIZES[2], MARATHON_PRIZE, ...Object.values(PERFECT_PRIZES)];
const catalog = new Map(prizes.map(prize => {
    const repository = `https://github.com/TheJollyLaMa/${prize.project}`;
    const metadataURI = prize.tokenId === 80 ? 'ipfs://QmYyFwg2BXcz63uVRSFF6L2crxe1Avhb234fzXdkwYCQaU' : prize.metadataURI;
    return [String(prize.tokenId), Object.freeze({
        ...prize, metadataURI,
        name: `${prize.project === 'DecentVoyager' ? 'Decent Voyager' : prize.project} v${prize.version} Supporter DNFT`,
        description: PURPOSES[prize.project],
        imageURI: `ipfs://${IMAGE_CIDS[prize.tokenId]}`,
        image: `assets/game/supporter-${prize.tokenId}.jpg`,
        repository,
        projectUrl: `${repository}/releases/tag/v${prize.version}`,
        canopyUrl: `https://thejollylama.github.io/DecentCanopy/?canopy=agency&view=1&q=${encodeURIComponent(prize.project)}`,
        tokenUrl: `https://basescan.org/token/${COLLECTION}?a=${prize.tokenId}`,
        metadataUrl: `https://gateway.pinata.cloud/ipfs/${metadataURI.slice(7)}`
    })];
}));

function supporterDetails(tokenId) { return catalog.get(String(tokenId)) || null; }

module.exports = { supporterDetails };
