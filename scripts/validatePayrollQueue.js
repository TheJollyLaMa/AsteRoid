const fs = require('node:fs');
const path = require('node:path');
const { validatePayroll } = require('./payroll');
function main() {
  const root = path.resolve(__dirname, '..');
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  validatePayroll(read('payroll-queue.json'), read('contributor-accounts.json'));
  console.log('Payroll queue and whitelisted accounts validated.');
}
if (require.main === module) main();
module.exports = { main };
