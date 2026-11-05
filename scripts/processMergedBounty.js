const fs = require('node:fs');
const path = require('node:path');
const { githubRequest, repositoryCoordinates, readEvent, postIssueComment } = require('./githubApi');
const { extractIssueNumbers, queueBounty, validatePayroll } = require('./payroll');
async function main() {
  const { slug, owner, repo } = repositoryCoordinates();
  const root = path.resolve(__dirname, '..'), read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  if (read('bounty-bot-config.json').enabled !== true) return;
  const event = readEvent();
  const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  const number = Number(process.env.INPUT_PR_NUMBER);
  if (manual && (!Number.isSafeInteger(number) || number < 1)) throw new Error('Invalid manual PR number');
  const pr = manual ? await githubRequest(`/repos/${slug}/pulls/${number}`) : await githubRequest(`/repos/${slug}/pulls/${event.pull_request?.number}`);
  if (!pr?.merged) { console.log('PR was not merged; no accrual.'); return; }
  const linked = await githubRequest('/graphql', { method: 'POST', body: JSON.stringify({ query: 'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){closingIssuesReferences(first:100){nodes{number repository{nameWithOwner}}}}}}', variables: { owner, repo, number: pr.number } }) });
  if (linked.errors) throw new Error('GitHub linked-issues query failed');
  const issues = [...new Set([...extractIssueNumbers(`${pr.title}\n${pr.body || ''}`, slug), ...(linked.data?.repository?.pullRequest?.closingIssuesReferences?.nodes || []).filter(issue => issue.repository.nameWithOwner.toLowerCase() === slug.toLowerCase()).map(issue => issue.number)])];
  const override = process.env.INPUT_ISSUE_NUMBER;
  if (manual && override) {
    for (const value of override.split(',')) { if (!/^\d+$/.test(value.trim()) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) throw new Error('Invalid manual issue number'); issues.push(Number(value)); }
  }
  let queue = read('payroll-queue.json'), accounts = read('contributor-accounts.json');
  validatePayroll(queue, accounts);
  for (const issueNumber of [...new Set(issues)]) {
    const issue = await githubRequest(`/repos/${slug}/issues/${issueNumber}`);
    if (issue.pull_request) continue;
    try {
      const result = queueBounty({ queue, accounts, issue, pr, slug });
      queue = result.queue; accounts = result.accounts;
      if (result.entries.length) await postIssueComment(issueNumber, `Owner-whitelisted merged PR #${pr.number} accrual: ${result.entries.map(entry => `${entry.amount} ${entry.currency}`).join(', ')}. Awaiting ledger persistence and owner-managed settlement; no on-chain payment was sent.`);
    } catch (error) { await postIssueComment(issueNumber, `Payroll not queued: ${error.message}. Maintainer can repair onboarding/labels and run manual recovery for merged PR #${pr.number}.`); }
  }
  validatePayroll(queue, accounts);
  for (const [name, data] of [['payroll-queue.json', queue], ['contributor-accounts.json', accounts]]) fs.writeFileSync(path.join(root, name), JSON.stringify(data, null, 2) + '\n');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
