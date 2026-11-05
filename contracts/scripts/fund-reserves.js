const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');

const journalPath = path.join(__dirname, '../deployments/base-reserves.json');
const deployment = require('../deployments/base-rewards.json');
const NFT = '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B';
const ESCROW = '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d';
const OWNER = '0x807061DF657A7697c04045dA7d16D941861cAABc';
const EDITIONS = [[70, 100], [71, 100], [75, 10], [76, 100], [77, 100], [78, 100], [79, 100], [80, 100]];
const ABI = [
    'function owner() view returns(address)',
    'function listings(uint256) view returns(address nftContract,uint256 tokenId,uint256 priceETH,address priceToken,uint256 priceAmount,uint256 available,bool active,string note)',
    'function delistDNFT(uint256)',
    'function withdrawNFT(address,uint256,uint256,address)',
    'function listDNFT(address,uint256,uint256,address,uint256,uint256,string) returns(uint256)',
    'event Listed(uint256 indexed listingId,address indexed nftContract,uint256 indexed tokenId,uint256 priceETH,address priceToken,uint256 priceAmount,uint256 quantity,string note)'
];

async function main() {
    assert.equal(process.env.EXECUTE_RESERVE_CUTOVER, 'yes', 'Explicit cutover authorization required');
    const plan = JSON.parse(fs.readFileSync(process.env.RESERVE_PLAN_PATH, 'utf8'));
    assert.equal(plan.chainId, 8453);
    assert.equal(plan.escrow, ESCROW);
    assert.equal(plan.nftContract, NFT);
    assert.equal(plan.proposedRewardCustodian, deployment.VoyagerRewards);
    assert.deepEqual(plan.reservations.map(item => [item.tokenId, item.reserve]), EDITIONS);
    assert.equal(plan.unsignedTransactions.length, 24);
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
    const reader = new ethers.JsonRpcProvider('https://mainnet.base.org');
    try {
        assert.equal((await provider.getNetwork()).chainId, 8453n);
        const signer = new ethers.Wallet(process.env.JOLLY_PRIVATE_KEY, provider);
        assert.equal(signer.address, OWNER);
        const escrow = new ethers.Contract(ESCROW, ABI, signer);
        assert.equal(await escrow.owner(), OWNER);
        assert.notEqual(await reader.getCode(deployment.VoyagerRewards), '0x');
        const nft = new ethers.Contract(NFT, ['function balanceOf(address,uint256) view returns(uint256)'], reader);
        const journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath, 'utf8')) :
            { chainId: 8453, custodian: deployment.VoyagerRewards, nftContract: NFT, escrow: ESCROW,
                status: 'CUTOVER_IN_PROGRESS', editions: [] };
        assert.equal(journal.custodian, deployment.VoyagerRewards);
        const persist = () => fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
        async function send(entry, action, method, args) {
            const data = escrow.interface.encodeFunctionData(method, args);
            if (!entry[action]) {
                await escrow[method].staticCall(...args);
                const tx = await escrow[method](...args);
                entry[action] = { hash: tx.hash, to: ESCROW, data };
                persist();
                console.log(`${entry.tokenId} ${action}: ${tx.hash}`);
            }
            const saved = entry[action];
            assert.equal(saved.data, data, 'Resumed calldata must match authorized operation');
            const receipt = await reader.waitForTransaction(saved.hash, 2, 180000);
            assert.ok(receipt && receipt.status === 1, `${action} transaction not confirmed successful`);
            const tx = await reader.getTransaction(saved.hash);
            assert.equal(tx.from, OWNER);
            assert.equal(tx.to, ESCROW);
            assert.equal(tx.data, data);
            assert.equal(tx.value, 0n);
            saved.blockNumber = receipt.blockNumber;
            persist();
            return receipt;
        }
        for (const item of plan.reservations) {
            let entry = journal.editions.find(value => value.tokenId === item.tokenId);
            if (!entry) {
                const old = await escrow.listings(item.oldListingId);
                assert.equal(old.active, true);
                assert.equal(old.nftContract, NFT);
                assert.equal(old.tokenId, BigInt(item.tokenId));
                assert.equal(old.available, BigInt(item.escrowStock));
                assert.equal(await nft.balanceOf(ESCROW, item.tokenId), old.available);
                assert.equal(await nft.balanceOf(deployment.VoyagerRewards, item.tokenId), 0n);
                assert.equal(old.priceETH, BigInt(item.priceETH));
                assert.equal(old.priceToken, item.priceToken);
                assert.equal(old.priceAmount, BigInt(item.priceAmount));
                entry = { ...item, note: old.note };
                journal.editions.push(entry);
                persist();
            }
            await send(entry, 'delist', 'delistDNFT', [item.oldListingId]);
            assert.equal((await escrow.listings(item.oldListingId)).active, false);
            if (!entry.withdraw) {
                assert.equal(await nft.balanceOf(ESCROW, item.tokenId), BigInt(item.escrowStock));
                assert.equal(await nft.balanceOf(deployment.VoyagerRewards, item.tokenId), 0n);
            }
            await send(entry, 'withdraw', 'withdrawNFT', [NFT, item.tokenId, item.reserve, deployment.VoyagerRewards]);
            assert.equal(await nft.balanceOf(deployment.VoyagerRewards, item.tokenId), BigInt(item.reserve));
            const receipt = await send(entry, 'relist', 'listDNFT', [NFT, item.tokenId, item.priceETH,
                item.priceToken, item.priceAmount, item.remainingSaleStock, entry.note]);
            const event = receipt.logs.filter(log => log.address.toLowerCase() === ESCROW.toLowerCase())
                .map(log => escrow.interface.parseLog(log)).find(log => log?.name === 'Listed');
            assert.ok(event, 'Replacement listing receipt missing Listed event');
            entry.newListingId = String(event.args.listingId);
            const listing = await escrow.listings(entry.newListingId);
            assert.equal(listing.active, true);
            assert.equal(listing.available, BigInt(item.remainingSaleStock));
            assert.equal(listing.tokenId, BigInt(item.tokenId));
            assert.equal(listing.priceAmount, BigInt(item.priceAmount));
            entry.purchaseUrl = `https://thejollylama.github.io/DecentHead/supporter/buy.html?chainId=8453&escrow=${ESCROW}&listingId=${entry.newListingId}`;
            entry.status = 'FUNDED_AND_RELISTED';
            persist();
        }
        journal.status = 'FUNDED_STOREFRONT_PUBLICATION_PENDING';
        journal.verifiedAt = new Date().toISOString();
        persist();
        console.log(JSON.stringify({ status: journal.status, total: 710,
            editions: journal.editions.map(({ tokenId, reserve, newListingId }) => ({ tokenId, reserve, newListingId })) }));
    } finally { provider.destroy(); reader.destroy(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
