const test = require('node:test');
const assert = require('node:assert/strict');
const { amountToUnits, unitsToAmount, parseBounties, extractIssueNumbers, queueBounty, validatePayroll } = require('../scripts/payroll');
const seedAccounts = require('../contributor-accounts.json');
const seedQueue = require('../payroll-queue.json');
const fixtureAccounts = { contributors: [{ github: 'TheJollyLaMa', walletAddress: '0x807061DF657A7697c04045dA7d16D941861cAABc', whitelisted: true, role: 'owner', totalEarnedByCurrency: { ART: '0', USDC: '0' }, pendingBalanceByCurrency: { ART: '0', USDC: '0' }, issuesClosed: [] }] };
function fixture() { return { queue: { pending: [], settled: [] }, accounts: structuredClone(fixtureAccounts), issue: { number: 12, labels: [{ name: 'bounty: 1.234567 USDC' }] }, pr: { number: 20, merged: true, user: { login: 'thejollylama' } } }; }
test('live repository payroll ledgers validate as workers and earnings evolve', () => { assert.equal(validatePayroll(seedQueue, seedAccounts), true); });
test('fixed decimal units preserve exact amounts without floating-point rounding', () => {
  assert.equal(amountToUnits('1.234567', 'USDC'), 1234567n); assert.equal(unitsToAmount(1234567n, 'USDC'), '1.234567');
  assert.equal(unitsToAmount(10000000n, 'USDC'), '10'); assert.equal(unitsToAmount(1n, 'ART'), '.00000001'.replace(/^\./, '0.'));
  for (const [amount, currency] of [['1.1234567', 'USDC'], ['1e3', 'ART'], ['-1', 'ART'], ['1', 'ETH']]) assert.throws(() => amountToUnits(amount, currency));
});
test('bounty labels reject ambiguity, unsupported currencies and nonpositive amount', () => {
  assert.deepEqual(parseBounties(['bug', { name: 'bounty: 2 ART' }, 'bounty: 0.1 USDC']), [{ amount: '2', currency: 'ART' }, { amount: '0.1', currency: 'USDC' }]);
  for (const labels of [['bounty: 0 ART'], ['bounty: 1 ETH'], ['bounty: 1 USDC', 'bounty: 2 USDC'], ['bounty: $(attack) ART']]) assert.throws(() => parseBounties(labels));
});
test('closing references must belong to this repo and dedupe', () => { assert.deepEqual(extractIssueNumbers('Closes #12; fixes TheJollyLaMa/AsteRoid#13; resolves Other/Repo#14; closes #12'), [12, 13]); });
test('merged author accrual requires whitelist and dedupes settled/pending issue currencies', () => {
  const input = fixture(), result = queueBounty(input);
  assert.equal(input.queue.pending.length, 0); assert.equal(result.entries.length, 1); assert.equal(validatePayroll(result.queue, result.accounts), true);
  assert.equal(result.accounts.contributors[0].pendingBalanceByCurrency.USDC, '1.234567'); assert.equal(result.accounts.contributors[0].issuesClosed.length, 1);
  assert.equal(queueBounty({ ...input, queue: result.queue, accounts: result.accounts }).entries.length, 0);
  assert.throws(() => queueBounty({ ...input, pr: { ...input.pr, merged: false } }));
  assert.throws(() => queueBounty({ ...input, pr: { ...input.pr, user: { login: 'unlisted' } } }));
  const settled = { pending: [], settled: result.queue.pending };
  assert.equal(queueBounty({ ...input, queue: settled }).entries.length, 0);
});
test('ledger validation rejects wallet mismatch, duplicate entries and balance drift', () => {
  const result = queueBounty(fixture());
  assert.throws(() => validatePayroll({ ...result.queue, pending: [...result.queue.pending, result.queue.pending[0]] }, result.accounts));
  const wrong = structuredClone(result.queue); wrong.pending[0].walletAddress = `0x${'1'.repeat(40)}`; assert.throws(() => validatePayroll(wrong, result.accounts));
  const drift = structuredClone(result.accounts); drift.contributors[0].pendingBalanceByCurrency.USDC = '0'; assert.throws(() => validatePayroll(result.queue, drift));
});
