const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');

const NFT = '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B';
const ESCROW = '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d';
const OWNER = '0x807061DF657A7697c04045dA7d16D941861cAABc';
const ORIGINAL_URI = 'ipfs://QmacnQSJCxmqjWnMxDqhkLXCJv1zqp1EKoeF7nY782rGpe';
const NOTE = 'TheJollyLaMa/DecentVoyager v1.0.0 Supporter DNFT';
const ABI = [
    'function owner() view returns(address)',
    'function listings(uint256) view returns(address nftContract,uint256 tokenId,uint256 priceETH,address priceToken,uint256 priceAmount,uint256 available,bool active,string note)',
    'function nextListingId() view returns(uint256)',
    'function delistDNFT(uint256)',
    'function listDNFT(address,uint256,uint256,address,uint256,uint256,string) returns(uint256)',
    'event Listed(uint256 indexed listingId,address indexed nftContract,uint256 indexed tokenId,uint256 priceETH,address priceToken,uint256 priceAmount,uint256 quantity,string note)'
];

async function main() {
    assert.equal(process.env.EXECUTE_VOYAGER_BRANDING, 'yes', 'Explicit branding correction authorization required');
    const directory = path.resolve(process.argv[2]);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'supporter-release.json')));
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'supporter-metadata.json')));
    assert.equal(manifest.repo, 'TheJollyLaMa/DecentVoyager');
    assert.equal(manifest.commit, 'f7b71fbd7f5a549f0b2be3f6c35b38f3b655b9f8');
    assert.equal(manifest.quantity, '1000');
    assert.equal(manifest.priceUSDC, '10000000');
    assert.match(manifest.metadataURI, /^ipfs:\/\/(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/);
    assert.notEqual(manifest.metadataURI, ORIGINAL_URI);
    assert.equal(metadata.name, 'Decent Voyager v1.0.0 Supporter DNFT');
    assert.equal(metadata.properties.repo, manifest.repo);
    assert.equal(metadata.properties.commit, manifest.commit);
    assert.equal(metadata.properties.back_image, manifest.back);
    assert.equal(metadata.animation_url, manifest.animation);
    assert.equal(metadata.image, manifest.front);
    assert.equal(metadata.external_url, 'https://github.com/TheJollyLaMa/DecentVoyager/releases/tag/v1.0.0');
    assert.equal(/asteroid/i.test(JSON.stringify(metadata)), false);
    const provider = new ethers.JsonRpcProvider('https://base-rpc.publicnode.com', 8453, { staticNetwork: true });
    try {
        assert.equal((await provider.getNetwork()).chainId, 8453n);
        const wallet = new ethers.Wallet(process.env.JOLLY_PRIVATE_KEY, provider);
        assert.equal(wallet.address, OWNER);
        const nft = new ethers.Contract(NFT, [
            'function hasRole(bytes32,address) view returns(bool)',
            'function uri(uint256) view returns(string)',
            'function setTokenURI(uint256,string)',
            'function balanceOf(address,uint256) view returns(uint256)',
            'function totalMinted(uint256) view returns(uint256)',
            'function maxSupply(uint256) view returns(uint256)',
            'event URI(string value,uint256 indexed id)'
        ], wallet);
        const escrow = new ethers.Contract(ESCROW, ABI, wallet);
        assert.equal(await nft.hasRole(ethers.ZeroHash, OWNER), true);
        assert.equal(await escrow.owner(), OWNER);
        const journalPath = path.join(directory, 'supporter-branding-correction.json');
        const journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath)) : {
            schema: 'voyager-branding-correction/1', chainId: 8453, nftContract: NFT, tokenId: '80',
            repository: manifest.repo, previousMetadataURI: ORIGINAL_URI, metadataURI: manifest.metadataURI,
            previousListingId: '18', status: 'prepared', transactions: {}
        };
        assert.equal(journal.metadataURI, manifest.metadataURI);
        const persist = () => fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
        async function send(key, contract, method, args) {
            const data = contract.interface.encodeFunctionData(method, args);
            let saved = journal.transactions[key];
            if (!saved) {
                await contract[method].staticCall(...args);
                const tx = await contract[method](...args);
                saved = journal.transactions[key] = { hash: tx.hash, to: await contract.getAddress(), data };
                persist();
                console.log(key, tx.hash);
            }
            assert.equal(saved.data, data, 'Resumed calldata differs');
            const receipt = await provider.waitForTransaction(saved.hash, 3, 180000);
            assert.ok(receipt && receipt.status === 1, `${key} not confirmed`);
            const tx = await provider.getTransaction(saved.hash);
            assert.equal(tx.from, OWNER); assert.equal(tx.to, saved.to);
            assert.equal(tx.data, data); assert.equal(tx.value, 0n);
            saved.blockNumber = receipt.blockNumber; persist();
            return receipt;
        }
        const currentURI = await nft.uri(80);
        assert.ok([ORIGINAL_URI, manifest.metadataURI].includes(currentURI), 'Unexpected concurrent token metadata change');
        if (!journal.stock) {
            const listing = await escrow.listings(18);
            assert.equal(listing.nftContract, NFT); assert.equal(listing.tokenId, 80n);
            assert.equal(listing.active, true); assert.equal(listing.priceAmount, 10000000n);
            assert.equal(listing.priceETH, 0n);
            assert.equal(listing.priceToken.toLowerCase(), '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
            assert.equal(await nft.balanceOf(ESCROW, 80), listing.available);
            assert.ok(listing.available > 0n);
            assert.equal(await nft.totalMinted(80), 1000n); assert.equal(await nft.maxSupply(80), 1000n);
            journal.stock = String(listing.available);
            journal.rewardStock = String(await nft.balanceOf('0xCa55A59BD2c15D0F11Ae5f7e7E96Bb58eb0B7DE5', 80));
            persist();
        }
        if (currentURI !== manifest.metadataURI || journal.transactions.metadata) {
            const receipt = await send('metadata', nft, 'setTokenURI', [80, manifest.metadataURI]);
            assert.ok(receipt.logs.filter(log => log.address.toLowerCase() === NFT.toLowerCase()).some(log => {
                const event = nft.interface.parseLog(log);
                return event?.name === 'URI' && event.args.id === 80n && event.args.value === manifest.metadataURI;
            }));
        }
        await send('delist', escrow, 'delistDNFT', [18]);
        const old = await escrow.listings(18);
        assert.equal(old.active, false);
        // A sale can occur before delisting is mined. Relist only the stock still held after that receipt.
        const remaining = await nft.balanceOf(ESCROW, 80);
        assert.ok(remaining > 0n && remaining <= BigInt(journal.stock));
        if (!journal.relistStock) { journal.relistStock = String(remaining); persist(); }
        const receipt = await send('relist', escrow, 'listDNFT', [
            NFT, 80, 0, old.priceToken, old.priceAmount, journal.relistStock, NOTE
        ]);
        const event = receipt.logs.filter(log => log.address.toLowerCase() === ESCROW.toLowerCase())
            .map(log => escrow.interface.parseLog(log)).find(log => log?.name === 'Listed');
        assert.ok(event); journal.listingId = String(event.args.listingId);
        const listing = await escrow.listings(journal.listingId);
        assert.equal(listing.active, true); assert.equal(listing.note, NOTE);
        assert.equal(listing.tokenId, 80n); assert.equal(listing.priceAmount, 10000000n);
        assert.ok(listing.available <= BigInt(journal.relistStock));
        assert.equal(await nft.uri(80), manifest.metadataURI);
        assert.equal(String(await nft.balanceOf('0xCa55A59BD2c15D0F11Ae5f7e7E96Bb58eb0B7DE5', 80)), journal.rewardStock);
        journal.available = String(listing.available);
        journal.purchaseUrl = `https://thejollylama.github.io/DecentHead/supporter/buy.html?chainId=8453&escrow=${ESCROW}&listingId=${journal.listingId}&priceUSDC=10000000`;
        journal.status = 'verified'; journal.observedBlock = await provider.getBlockNumber();
        persist(); console.log(JSON.stringify(journal, null, 2));
    } finally { provider.destroy(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
