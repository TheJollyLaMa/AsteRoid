const fs = require('node:fs');
const path = require('node:path');
const { readEvent, postIssueComment } = require('./githubApi');
async function main() {
  const { parseClaimBody, appendClaim } = await import('../src/js/dnft/validation.mjs');
  const event = readEvent(), issue = event.issue;
  if (!issue || !Number.isSafeInteger(issue.number)) throw new Error('Issue event required');
  const eligible = (issue.labels || []).some(label => (label.name || label) === 'victory-stamp') || /### Claim JSON/.test(issue.body || '');
  if (!eligible) return;
  let claim;
  try { claim = parseClaimBody(issue.body); }
  catch (error) { await postIssueComment(issue.number, `Victory stamp rejected: ${error.message.slice(0, 200)}. Supply exactly one valid asteroid-dnft-claim/1 JSON object. No mint occurred.`); return; }
  const file = path.join(__dirname, '..', 'victory-stamps.json');
  const result = appendClaim(JSON.parse(fs.readFileSync(file, 'utf8')), claim, { number: issue.number, url: issue.html_url });
  if (process.argv.includes('--comment')) {
    const entry = [...result.queue.pending, ...result.queue.minted].find(item => item.recordId === claim.recordId || item.tokenURI === claim.tokenURI);
    await postIssueComment(issue.number, entry ? `Victory stamp queue contains this record (issue #${entry.issueNumber || issue.number}). ${result.queue.minted.includes(entry) ? 'Published as minted; see the ledger for transaction proof.' : 'Awaiting owner review and Base batch mint. This is not an NFT yet.'} Local game telemetry is not a verified anti-cheat proof.` : 'Queue update was not persisted; contact the maintainer.');
    return;
  }
  if (result.added) fs.writeFileSync(file, JSON.stringify(result.queue, null, 2) + '\n');
  console.log(result.added ? 'Victory claim validated and appended.' : 'Existing record/token URI; nothing appended.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
