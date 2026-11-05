const fs = require('node:fs');
function repositoryCoordinates() {
  const slug = process.env.GITHUB_REPOSITORY || 'TheJollyLaMa/DecentVoyager';
  if (!/^[\w.-]+\/[\w.-]+$/.test(slug)) throw new Error('Invalid repository slug');
  const [owner, repo] = slug.split('/'); return { owner, repo, slug };
}
async function githubRequest(endpoint, options = {}) {
  if (!endpoint.startsWith('/repos/') && endpoint !== '/graphql') throw new Error('Unsupported GitHub API endpoint');
  const response = await fetch(`https://api.github.com${endpoint}`, { ...options, headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GITHUB_TOKEN || ''}`, 'X-GitHub-Api-Version': '2022-11-28', ...options.headers }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) { const error = new Error(`GitHub API HTTP ${response.status}`); error.status = response.status; throw error; }
  return response.status === 204 ? null : response.json();
}
function readEvent() { if (!process.env.GITHUB_EVENT_PATH) throw new Error('GITHUB_EVENT_PATH is required'); return JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')); }
function postIssueComment(number, body) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid issue number');
  const { slug } = repositoryCoordinates(); return githubRequest(`/repos/${slug}/issues/${number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
}
module.exports = { githubRequest, repositoryCoordinates, readEvent, postIssueComment };
