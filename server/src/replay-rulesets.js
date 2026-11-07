'use strict';

const Game = require('../../src/js/game');
const RULESET = require('../../src/js/ruleset');
const LegacyGame = require('../legacy/voyager-1.3-mini-emblem/game');
const LEGACY_RULESET = require('../legacy/voyager-1.3-mini-emblem/ruleset');

const games = new Map([[RULESET, Game], [LEGACY_RULESET, LegacyGame]]);

function gameForRuleset(ruleset) {
  const implementation = games.get(ruleset);
  if (!implementation) throw new Error('Flight uses an unsupported older game ruleset. Reload Voyager and start a new flight; existing claim vouchers remain valid.');
  return implementation;
}

module.exports = { gameForRuleset };
