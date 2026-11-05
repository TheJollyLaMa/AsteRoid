// Fills DecentHead's right ankh (profile) menu with the pilot's Victory Vault and queued rewards.
const counts = { vault: 0, rewards: 0 };
const ENTRIES = [
  { id: 'vault', label: count => `🏆 Victory Vault${count ? ` · ${count}` : ''}`, event: 'voyager:open-vault' },
  { id: 'rewards', label: count => `✦ Rewards waiting${count ? ` · ${count}` : ''}`, event: 'voyager:open-rewards' },
  { id: 'manual', label: () => 'ⓘ Flight manual', about: true },
];

function menuRoot() { return document.querySelector('decent-header')?.shadowRoot?.querySelector('ankh-menu[side="right"]')?.shadowRoot || null; }

function attach() {
  const root = menuRoot(), options = root?.querySelector('.options');
  if (!options) return false;
  if (!options.querySelector('[data-voyager-entry]')) {
    const details = root.querySelector('details');
    options.replaceChildren(...ENTRIES.map(entry => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.voyagerEntry = entry.id; button.style.cursor = 'pointer'; button.style.whiteSpace = 'nowrap';
      button.addEventListener('click', () => {
        if (details) details.open = false;
        const opener = root.querySelector('summary');
        if (entry.about) document.querySelector('decent-header')?.shadowRoot?.querySelector('about-modal')?.open?.();
        else window.dispatchEvent(new CustomEvent(entry.event, { detail: { opener } }));
      });
      return button;
    }));
  }
  for (const entry of ENTRIES) {
    const button = options.querySelector(`[data-voyager-entry="${entry.id}"]`);
    if (button) button.textContent = entry.label(counts[entry.id] || 0);
  }
  const summary = root.querySelector('summary'), waiting = counts.rewards;
  if (summary) summary.setAttribute('aria-label', waiting ? `Profile menu, ${waiting} reward${waiting === 1 ? '' : 's'} waiting` : 'Profile menu');
  return true;
}

export function mountProfileMenu() {
  window.addEventListener('voyager:vault-count', event => { counts.vault = Number(event.detail?.count) || 0; attach(); });
  window.addEventListener('voyager:rewards-count', event => { counts.rewards = Number(event.detail?.count) || 0; attach(); });
  const tryAttach = () => { if (!attach()) setTimeout(tryAttach, 200); };
  window.addEventListener('decenthead:ready', tryAttach);
  tryAttach();
}

if (typeof document !== 'undefined') mountProfileMenu();
