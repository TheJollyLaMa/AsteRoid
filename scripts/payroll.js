const assets = require('../payroll-assets.json').assets;
const loginKey = value => String(value || '').toLowerCase();
const walletOK = value => /^0x[\da-f]{40}$/i.test(value || '') && !/^0x0{40}$/i.test(value);
function amountToUnits(value, currency) {
  const decimals = assets[currency]?.ledgerDecimals;
  if (!Number.isInteger(decimals)) throw new Error('Unsupported bounty currency');
  const text = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(text) || text.length > 40) throw new Error('Invalid decimal bounty amount');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new Error('Bounty precision exceeds ledger decimals');
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units > 10n ** 30n) throw new Error('Bounty amount is too large');
  return units;
}
function unitsToAmount(units, currency) {
  const decimals = assets[currency]?.ledgerDecimals;
  if (!Number.isInteger(decimals) || units < 0n) throw new Error('Invalid units');
  const text = units.toString().padStart(decimals + 1, '0');
  return `${text.slice(0, -decimals)}.${text.slice(-decimals)}`.replace(/\.?0+$/, '') || '0';
}
function parseBounties(labels = []) {
  const result = [], seen = new Set();
  for (const label of labels) {
    const name = label.name || label;
    if (!/^bounty:/i.test(name)) continue;
    const match = /^bounty:\s*(\d+(?:\.\d+)?)\s*\$?([A-Za-z][A-Za-z0-9]{1,9})$/i.exec(name);
    if (!match) throw new Error('Malformed bounty label');
    const currency = match[2].toUpperCase(), units = amountToUnits(match[1], currency);
    if (units <= 0n || seen.has(currency)) throw new Error('Bounty must be positive and unique per currency');
    seen.add(currency); result.push({ currency, amount: unitsToAmount(units, currency) });
  }
  return result;
}
function extractIssueNumbers(text = '', slug = 'TheJollyLaMa/AsteRoid') {
  const numbers = [];
  for (const match of text.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/gi)) {
    if (match[1] && loginKey(match[1]) !== loginKey(slug)) continue;
    const number = Number(match[2]); if (Number.isSafeInteger(number) && number > 0) numbers.push(number);
  }
  return [...new Set(numbers)];
}
function queueBounty({ queue, accounts, issue, pr, slug = 'TheJollyLaMa/AsteRoid', now = new Date().toISOString() }) {
  if (pr.merged !== true || !Number.isSafeInteger(pr.number) || !Number.isSafeInteger(issue.number)) throw new Error('Merged PR and issue numbers required');
  const bounties = parseBounties(issue.labels);
  if (!bounties.length) return { entries: [], queue, accounts };
  const account = accounts.contributors.find(item => loginKey(item.github) === loginKey(pr.user?.login) && item.whitelisted === true);
  if (!account || !walletOK(account.walletAddress)) throw new Error('PR author needs an owner-whitelisted wallet before payroll can be queued');
  const nextQueue = structuredClone(queue), nextAccounts = structuredClone(accounts);
  const nextAccount = nextAccounts.contributors.find(item => loginKey(item.github) === loginKey(account.github));
  const entries = [];
  for (const bounty of bounties) {
    const identity = `${slug}#${issue.number}:${bounty.currency}:implementer`;
    if ([...nextQueue.pending, ...nextQueue.settled].some(entry => entry.id === identity)) continue;
    const entry = { id: identity, contributorGithub: account.github, walletAddress: account.walletAddress, role: 'implementer', amount: bounty.amount, currency: bounty.currency, chainId: 8453, issueNumber: issue.number, issueRef: `${slug}#${issue.number}`, prNumber: pr.number, queuedAt: now };
    entries.push(entry); nextQueue.pending.push(entry);
    for (const field of ['totalEarnedByCurrency', 'pendingBalanceByCurrency']) {
      nextAccount[field] ||= {};
      nextAccount[field][bounty.currency] = unitsToAmount(amountToUnits(nextAccount[field][bounty.currency] || '0', bounty.currency) + amountToUnits(bounty.amount, bounty.currency), bounty.currency);
    }
    nextAccount.issuesClosed ||= [];
    if (!nextAccount.issuesClosed.includes(entry.issueRef)) nextAccount.issuesClosed.push(entry.issueRef);
  }
  return { entries, queue: nextQueue, accounts: nextAccounts };
}
function validatePayroll(queue, accounts) {
  if (!Array.isArray(queue?.pending) || !Array.isArray(queue?.settled) || !Array.isArray(accounts?.contributors)) throw new Error('Invalid payroll ledger arrays');
  const identities = new Set(), semanticIds = new Set(), handles = new Set(), pendingTotals = new Map();
  for (const account of accounts.contributors) {
    const key = loginKey(account.github);
    if (!/^[-\w]{1,39}$/.test(account.github || '') || handles.has(key) || !walletOK(account.walletAddress) || typeof account.whitelisted !== 'boolean') throw new Error('Invalid or duplicate contributor');
    handles.add(key);
    if (!Array.isArray(account.issuesClosed)) throw new Error('Missing issuesClosed');
    for (const field of ['totalEarnedByCurrency', 'pendingBalanceByCurrency']) for (const [currency, amount] of Object.entries(account[field] || {})) amountToUnits(amount, currency);
  }
  for (const entry of [...queue.pending, ...queue.settled]) {
    if (typeof entry.id !== 'string' || identities.has(entry.id)) throw new Error('Duplicate/invalid payroll entry ID');
    identities.add(entry.id);
    const account = accounts.contributors.find(item => loginKey(item.github) === loginKey(entry.contributorGithub));
    if (!account?.whitelisted || !walletOK(entry.walletAddress) || entry.walletAddress.toLowerCase() !== account.walletAddress.toLowerCase()) throw new Error('Payroll recipient is not whitelisted or wallet mismatches');
    if (entry.chainId !== 8453 || entry.role !== 'implementer' || !Number.isSafeInteger(entry.issueNumber) || entry.issueNumber <= 0 || !Number.isSafeInteger(entry.prNumber) || entry.prNumber <= 0 || !Number.isFinite(Date.parse(entry.queuedAt))) throw new Error('Invalid payroll entry fields');
    const semanticId = `${entry.issueRef}:${entry.currency}:${entry.role}`;
    if (entry.id !== semanticId || semanticIds.has(semanticId)) throw new Error('Duplicate or mismatched issue/currency payroll identity');
    semanticIds.add(semanticId);
    const units = amountToUnits(entry.amount, entry.currency); if (units <= 0n) throw new Error('Payout must be positive');
    if (queue.pending.includes(entry)) { const key = `${loginKey(account.github)}:${entry.currency}`; pendingTotals.set(key, (pendingTotals.get(key) || 0n) + units); }
  }
  for (const account of accounts.contributors) for (const currency of Object.keys(assets)) {
    const pending = amountToUnits(account.pendingBalanceByCurrency?.[currency] || '0', currency);
    if (pending !== (pendingTotals.get(`${loginKey(account.github)}:${currency}`) || 0n)) throw new Error('Pending contributor balance does not match queue');
    if (amountToUnits(account.totalEarnedByCurrency?.[currency] || '0', currency) < pending) throw new Error('Earned amount is below pending');
  }
  return true;
}
module.exports = { amountToUnits, unitsToAmount, parseBounties, extractIssueNumbers, queueBounty, validatePayroll };
