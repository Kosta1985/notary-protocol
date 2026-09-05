import { lookupEvidence, publicErrorMessage } from './public-evidence.js';

const form = document.querySelector('#verify-form');
const input = document.querySelector('#verify-id');
const out = document.querySelector('#verify-result');
let current = null;
let sequence = 0;

function show(title, message, details, outcome = 'record') {
  out.className = 'verify-result show';
  out.dataset.outcome = outcome;
  const heading = document.createElement('strong');
  heading.textContent = title;
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = message;
  out.replaceChildren(heading, note);
  if (details !== undefined) {
    const pre = document.createElement('pre');
    pre.className = 'evidence-json';
    pre.textContent = JSON.stringify(details, null, 2);
    out.append(pre);
  }
}
form?.addEventListener('submit', async event => {
  event.preventDefault();
  current?.abort();
  const controller = new AbortController();
  current = controller;
  const ticket = ++sequence;
  const id = input.value.trim();
  out.setAttribute('aria-busy', 'true');
  show('Checking evidence...', 'Looking up the exact reference. No result is inferred while loading.');
  try {
    const result = await lookupEvidence(id, { signal: controller.signal });
    if (ticket !== sequence) return;
    show(result.title, result.description, result.data, result.outcome);
  } catch (error) {
    if (ticket !== sequence || error.code === 'cancelled') return;
    show('Not verified', publicErrorMessage(error), undefined, 'invalid');
  } finally {
    if (ticket === sequence) out.setAttribute('aria-busy', 'false');
  }
});
// Editing an ID invalidates an in-flight result, even before the next submit.
input?.addEventListener('input', () => {
  if (!current) return;
  current.abort(); current = null; sequence += 1;
  out.setAttribute('aria-busy', 'false');
  show('Reference changed', 'Press Verify to check the new reference.');
});
window.addEventListener('pagehide', () => current?.abort());
