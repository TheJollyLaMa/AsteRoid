'use strict';

const {
  TypedDataEncoder,
  Wallet,
  ZeroAddress,
  concat,
  getAddress,
  keccak256,
  toUtf8Bytes,
  verifyTypedData,
  zeroPadValue
} = require('ethers');
const { DOMAIN, TYPES } = require('./eip712');

function jsonSafe(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}

function makeVoucherService({ privateKey, chainId = 84532, arenaAddress, stampsAddress, prizesAddress, rewardsAddress, nftAddress }) {
  const signer = privateKey ? new Wallet(privateKey) : null;
  const domainFor = (verifyingContract) => ({
    ...DOMAIN,
    chainId: Number(chainId),
    verifyingContract: getAddress(verifyingContract || ZeroAddress)
  });
  const assertSigner = () => {
    if (!signer) throw new Error('REFEREE_PRIVATE_KEY is not configured.');
  };
  const assertContract = (address, label) => {
    if (!address || getAddress(address) === ZeroAddress) throw new Error(`${label} verifying contract is not configured.`);
  };
  const sign = async (typeName, value, verifyingContract) => {
    assertSigner();
    assertContract(verifyingContract, typeName);
    const domain = domainFor(verifyingContract);
    const signature = await signer.signTypedData(domain, { [typeName]: TYPES[typeName] }, value);
    return {
      domain,
      type: typeName,
      value: jsonSafe(value),
      digest: TypedDataEncoder.hash(domain, { [typeName]: TYPES[typeName] }, value),
      signature
    };
  };
  return {
    address: signer ? signer.address : null,
    domainFor,
    async stamp({ player, record, metadataURI = '', deadline }) {
      if (record.level !== 20 || record.difficulty === 'cadet') throw new Error('New achievement vouchers require a Pilot or Ace level 20 win.');
      const value = {
        player: getAddress(player),
        recordId: keccak256(toUtf8Bytes(record.id)),
        level: Number(record.level),
        difficulty: ({ cadet: 0, pilot: 1, ace: 2 })[record.difficulty],
        metadataURI: String(metadataURI),
        deadline: BigInt(deadline)
      };
      if (!Number.isInteger(value.difficulty)) throw new Error('Record difficulty cannot be encoded for StampVoucher.');
      return sign('StampVoucher', value, stampsAddress);
    },
    async prize({ player, nftContract = nftAddress, tokenId, tier, runId, deadline }) {
      const value = {
        player: getAddress(player),
        nftContract: getAddress(nftContract),
        tokenId: BigInt(tokenId),
        tier: Number(tier),
        runId: keccak256(toUtf8Bytes(String(runId))),
        deadline: BigInt(deadline)
      };
      return sign('PrizeVoucher', value, prizesAddress);
    },
    async bundle({ player, nftContract = nftAddress, tokenId = 0, nftAmount = 1, runId, awardId, recordId, bonus, nativeAmount = 0, deadline }) {
      return sign('RewardBundle', {
        gameId: keccak256(toUtf8Bytes('decent-voyager')), player: getAddress(player),
        nftContract: getAddress(nftContract), tokenId: BigInt(tokenId), nftAmount: BigInt(nftAmount),
        paymentToken: bonus ? getAddress(bonus.token) : ZeroAddress,
        tokenAmount: bonus ? BigInt(bonus.amount) : 0n, nativeAmount: BigInt(nativeAmount),
        awardId: keccak256(toUtf8Bytes(awardId)), claimId: keccak256(toUtf8Bytes(runId)),
        recordId: keccak256(toUtf8Bytes(recordId)), deadline: BigInt(deadline)
      }, rewardsAddress);
    },
    async settle({ roundId, survivors, nonce, deadline }) {
      const sorted = sortAddresses(survivors);
      const survivorsHash = hashSortedSurvivors(sorted);
      const value = { roundId: BigInt(roundId), survivorsHash, nonce: BigInt(nonce), deadline: BigInt(deadline) };
      return { ...(await sign('Settle', value, arenaAddress)), survivors: sorted, survivorsHash };
    },
    verify(typeName, value, signature, verifyingContract) {
      return verifyTypedData(domainFor(verifyingContract), { [typeName]: TYPES[typeName] }, value, signature);
    }
  };
}

function sortAddresses(addresses) {
  return [...new Set((addresses || []).map((address) => getAddress(address)))].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function hashSortedSurvivors(addresses) {
  const sorted = sortAddresses(addresses);
  const packed = concat(sorted.map((address) => zeroPadValue(address, 32)));
  return keccak256(packed);
}

module.exports = { makeVoucherService, sortAddresses, hashSortedSurvivors };
