const { readEvent, postIssueComment, repositoryCoordinates } = require('./githubApi');
async function main() {
  const event = readEvent();
  if (!(event.issue?.labels || []).some(label => label.name === 'whitelist-request')) return;
  const { slug } = repositoryCoordinates();
  await postIssueComment(event.issue.number, `@TheJollyLaMa — contributor onboarding request in ${slug}. Review the public GitHub identity, contact the person directly, and confirm wallet ownership before an owner-reviewed contributor-accounts.json change. Never post private information or keys here. This issue does not authorize a wallet or payout.`);
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
