const { githubRequest, repositoryCoordinates, postIssueComment } = require('./githubApi');
const { parseBounties } = require('./payroll');
async function main() {
  const number = Number(process.env.INPUT_ISSUE_NUMBER);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Invalid issue number');
  const name = `bounty: ${process.env.INPUT_AMOUNT} ${process.env.INPUT_CURRENCY}`;
  const [bounty] = parseBounties([name]);
  const { slug } = repositoryCoordinates();
  const label = `bounty: ${bounty.amount} ${bounty.currency}`;
  const issue = await githubRequest(`/repos/${slug}/issues/${number}`);
  if (issue.state !== 'open' || issue.pull_request) throw new Error('Bounties must target open issues');
  if (parseBounties(issue.labels).some(item => item.currency === bounty.currency)) throw new Error('This issue already has a bounty in this currency; edit its existing label intentionally');
  try { await githubRequest(`/repos/${slug}/labels`, { method: 'POST', body: JSON.stringify({ name: label, color: 'f0c040', description: 'Owner-approved repo development bounty; whitelisted wallets only' }) }); }
  catch (error) { if (error.status !== 422) throw error; await githubRequest(`/repos/${slug}/labels/${encodeURIComponent(label)}`); }
  await githubRequest(`/repos/${slug}/issues/${number}/labels`, { method: 'POST', body: JSON.stringify({ labels: [label] }) });
  await postIssueComment(number, `Bounty posted: **${bounty.amount} ${bounty.currency}**. An owner-whitelisted PR author must merge a PR closing this issue. This creates a ledger accrual, not an automatic payout. Contact @TheJollyLaMa for onboarding; do not self-register.`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
