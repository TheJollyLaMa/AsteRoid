import { assertJsonSafe, validateRecord } from './validation.mjs';
export const VAULT_KEY = 'asteroid-victory-vault/1';
export class VictoryVault {
  constructor(storage) {
    this.storage = storage; this.entries = []; this.error = '';
    try { this.storage ||= globalThis.localStorage; if (!this.storage) throw new Error('Storage unavailable'); const saved = JSON.parse(this.storage.getItem(VAULT_KEY) || '[]'); assertJsonSafe(saved); if (Array.isArray(saved)) this.entries = saved.filter(entry => { try { validateRecord(entry.record); return true; } catch { return false; } }).slice(-200); } catch { this.error = 'Stored vault was unavailable. Wins remain in the game save; export claims before clearing browser storage.'; }
  }
  persist() {
    try { if (!this.storage) throw new Error('Storage unavailable'); this.storage.setItem(VAULT_KEY, JSON.stringify(this.entries)); this.error = ''; } catch { this.error = 'Browser storage is full/unavailable. Copy your claim JSON now; this claim is not durably saved.'; }
  }
  merge(records = []) {
    for (const record of records) {
      try { validateRecord(record); } catch { continue; }
      if (!this.entries.some(entry => entry.record.id === record.id)) this.entries.push({ record: JSON.parse(JSON.stringify(record)), status: 'not pinned' });
    }
    this.entries = this.entries.slice(-200); this.persist(); return this.entries;
  }
  update(id, patch) { const entry = this.entries.find(item => item.record.id === id); if (!entry) throw new Error('Victory record not found'); Object.assign(entry, patch); this.persist(); return entry; }
}
