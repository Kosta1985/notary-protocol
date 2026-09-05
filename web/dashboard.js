import { loadPassportEvidence, requestJson, publicErrorMessage } from './public-evidence.js';
import { capabilityProbes, describeCapability } from './dashboard-data.js';
const form = document.querySelector('#passport-form');
const input = document.querySelector('#passport-id');
const result = document.querySelector('#passport-result');
const status = document.querySelector('#service-status');
const refresh = document.querySelector('#service-refresh');
const statusNote = document.querySelector('#service-status-note');
let controller = null, sequence = 0, statusController = null, statusSequence = 0, suspended = false;

function clearEvidence(message) {
  sequence++; controller?.abort(); controller = null;
  result.className = 'verify-result show'; result.textContent = message;
  result.setAttribute('aria-busy', 'false');
}
form?.addEventListener('submit', async event => {
  event.preventDefault(); if (suspended) return;
  controller?.abort(); controller = new AbortController();
  const ticket = ++sequence, id = input.value.trim();
  result.className = 'verify-result show'; result.textContent = 'Loading public evidence...'; result.setAttribute('aria-busy', 'true');
  try {
    const data = await loadPassportEvidence(id, { signal: controller.signal }); if (ticket !== sequence) return;
    const heading = document.createElement('strong'); heading.textContent = id;
    const note = document.createElement('p'); note.className = 'muted'; note.textContent = data.warnings.length ? 'Passport loaded. Some supplementary evidence is unavailable; see warnings below.' : 'Current public evidence loaded. This is not a new proof of key possession.';
    const pre = document.createElement('pre'); pre.className = 'evidence-json'; pre.textContent = JSON.stringify(data, null, 2);
    result.replaceChildren(heading, note, pre);
  } catch (error) { if (ticket === sequence && error.code !== 'cancelled') result.textContent = publicErrorMessage(error); }
  finally { if (ticket === sequence) result.setAttribute('aria-busy', 'false'); }
});
input?.addEventListener('input', () => {
  if (controller) clearEvidence('Reference changed. Load the new Passport to view its evidence.');
});
function statusCard(probe) {
  const article = document.createElement('article'); article.className = 'card'; article.dataset.servicePath = probe.path;
  const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'Checking';
  const heading = document.createElement('h3'); heading.textContent = probe.name;
  const note = document.createElement('p'); note.textContent = 'Waiting for the public capability document. No readiness is inferred.';
  article.append(tag, heading, note); return { article, tag, note };
}
async function loadStatuses() {
  if (!status || suspended) return;
  statusController?.abort(); statusController = new AbortController();
  const { signal } = statusController, ticket = ++statusSequence;
  refresh.disabled = true; statusNote.textContent = 'Checking public APIs independently...';
  const cards = capabilityProbes.map(probe => statusCard(probe));
  status.replaceChildren(...cards.map(card => card.article));
  let completed = 0, failed = 0;
  await Promise.all(capabilityProbes.map(async (probe, index) => {
    const card = cards[index];
    try {
      const body = await requestJson(probe.path, { signal });
      const detail = describeCapability(probe, body);
      if (ticket !== statusSequence || signal.aborted) return;
      card.tag.textContent = 'API responding'; card.note.textContent = detail;
    } catch (error) {
      if (ticket !== statusSequence || signal.aborted || error.code === 'cancelled') return;
      failed++; card.tag.textContent = 'Not confirmed'; card.note.textContent = publicErrorMessage(error);
    } finally {
      if (ticket === statusSequence && !signal.aborted) {
        completed++;
        statusNote.textContent = `Checked ${completed} of ${capabilityProbes.length} public APIs. ${failed} not confirmed. Individual results are shown below.`;
      }
    }
  }));
  if (ticket === statusSequence && !signal.aborted) refresh.disabled = false;
}
refresh?.addEventListener('click', loadStatuses);
window.addEventListener('pagehide', () => {
  suspended = true;
  clearEvidence('Page left. Recheck the Passport before relying on its current evidence.');
  statusSequence++; statusController?.abort(); statusController = null;
  status.replaceChildren(); refresh.disabled = false;
  statusNote.textContent = 'Service checks need refreshing after returning to this page.';
});
window.addEventListener('pageshow', event => {
  suspended = false;
  if (event.persisted) void loadStatuses();
});
void loadStatuses();
