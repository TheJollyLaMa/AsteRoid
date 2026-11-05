'use strict';

const MAX_CARD_BYTES = 4 * 1024 * 1024;
const CARD_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

function createPinata({ jwt, fetchImpl = global.fetch }) {
  async function request(url, options) {
    const response = await fetchImpl(url, {
      ...options,
      headers: { ...(options.headers || {}), authorization: `Bearer ${jwt}` }
    });
    if (!response.ok) throw new Error(`Pinata request failed (${response.status}).`);
    return response.json();
  }
  return {
    async pinRecord(record, battleCard) {
      if (!jwt) return { status: 'skipped', reason: 'PINATA_JWT is not configured.', metadataURI: '', imageURI: '' };
      let imageURI = '';
      if (battleCard) {
        const match = CARD_RE.exec(battleCard);
        if (!match) throw new Error('Battle card must be a PNG, JPEG, or WebP data URL.');
        const bytes = Buffer.from(match[2], 'base64');
        if (bytes.length > MAX_CARD_BYTES) throw new Error('Battle card exceeds the 4 MB pinning limit.');
        const form = new FormData();
        form.append('file', new Blob([bytes], { type: match[1] }), 'battle-card');
        const pinnedImage = await request('https://api.pinata.cloud/pinning/pinFileToIPFS', { method: 'POST', body: form });
        imageURI = `ipfs://${pinnedImage.IpfsHash}`;
      }
      const metadata = {
        name: `Decent Voyager level ${record.level} victory stamp`,
        description: `Verified Decent Voyager ${record.difficulty} run record for level ${record.level}.`,
        ...(imageURI ? { image: imageURI } : {}),
        attributes: [
          { trait_type: 'Level', value: Number(record.level) },
          { trait_type: 'Difficulty', value: String(record.difficulty) },
          { trait_type: 'Score', value: Number(record.score && record.score.total || 0) }
        ],
        properties: { record }
      };
      const pinned = await request('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(metadata)
      });
      return { status: 'pinned', metadataURI: `ipfs://${pinned.IpfsHash}`, imageURI };
    }
  };
}

module.exports = { createPinata, MAX_CARD_BYTES };
