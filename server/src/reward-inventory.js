'use strict';

const { Contract, JsonRpcProvider, getAddress } = require('ethers');

function createRewardInventory({ rpcUrl, chainId, nftAddress, prizesAddress, legacyPrizesAddress }) {
  let provider;
  return {
    async read(player, tokenId, bonus) {
      if (!rpcUrl || !prizesAddress) throw new Error('Reward inventory RPC and prize custody must be configured.');
      provider ||= new JsonRpcProvider(rpcUrl);
      if (Number((await provider.getNetwork()).chainId) !== chainId) throw new Error('Reward inventory RPC is on the wrong chain.');
      const nft = new Contract(getAddress(nftAddress), ['function balanceOf(address,uint256) view returns(uint256)'], provider);
      const prizes = new Contract(getAddress(prizesAddress), ['function claimedToken(address,address,uint256) view returns(bool)'], provider);
      const blockTag = await provider.getBlockNumber();
      const [stock, claimed] = await Promise.all([
        nft.balanceOf(prizesAddress, tokenId, { blockTag }),
        prizes.claimedToken(player, nftAddress, tokenId, { blockTag })
      ]);
      if (stock > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Reward stock exceeds supported reservation bounds.');
      let legacyClaimed = false;
      if (legacyPrizesAddress) {
        const legacy = new Contract(getAddress(legacyPrizesAddress), ['function claimedToken(address,uint256) view returns(bool)'], provider);
        legacyClaimed = await legacy.claimedToken(player, tokenId, { blockTag });
      }
      let tokenBalance;
      if (bonus) {
        const token = new Contract(getAddress(bonus.token), ['function balanceOf(address) view returns(uint256)'], provider);
        tokenBalance = String(await token.balanceOf(prizesAddress, { blockTag }));
      }
      return { stock: Number(stock), claimed: claimed || legacyClaimed,
        nativeBalance: String(await provider.getBalance(prizesAddress, blockTag)),
        ...(bonus ? { paymentToken: bonus.token, tokenBalance } : {}) };
    },
    close() { provider?.destroy(); }
  };
}

module.exports = { createRewardInventory };
