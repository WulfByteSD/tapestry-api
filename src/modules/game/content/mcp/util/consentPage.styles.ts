import { createHash } from 'crypto';

/** Portal palette and BrandMark typography, kept local to the API's script-free consent page.
 * Compiled by tsc with the renderer: no runtime assets, network fonts, or cwd-dependent reads.
 */
export const consentStyles = `
:root {
  color-scheme: dark;
  --base: #14002b;
  --base-2: #1d043d;
  --ink: #090510;
  --paper: #fbf6ea;
  --text: #f7f1ff;
  --muted: #cdbde8;
  --gold: #d4af37;
  --gold-light: #f2d06b;
  --border: #493459;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  color: var(--text);
  background: var(--ink);
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: linear-gradient(115deg, var(--base), var(--ink) 75%);
  font-size: 1rem;
  line-height: 1.6;
}
button, input { font: inherit; }
button { cursor: pointer; }
p, h1, h2 { margin: 0; }
bdi, code { overflow-wrap: anywhere; }
::selection { background: #695020; color: var(--paper); }
:focus-visible { outline: 3px solid var(--gold-light); outline-offset: 4px; }
.shell { width: min(100% - 3rem, 64rem); margin: 0 auto; }
.brand { padding: 2.25rem 0 1.5rem; border-bottom: 1px solid var(--border); }
.wordmark {
  display: block;
  color: var(--paper);
  font-size: 1.05rem;
  font-weight: 900;
  letter-spacing: .04em;
  line-height: 1;
  text-transform: uppercase;
}
.tagline { display: block; margin-top: .5rem; color: var(--muted); font-size: .78rem; line-height: 1.4; }
main { padding: 2.75rem 0 0; }
.eyebrow { color: var(--gold-light); font-size: .75rem; font-weight: 750; letter-spacing: .16em; text-transform: uppercase; }
h1 { margin-top: .65rem; color: var(--paper); font-size: clamp(2rem, 5vw, 2.75rem); line-height: 1.13; letter-spacing: -.035em; }
.intro { margin: .9rem 0 2rem; color: var(--muted); max-width: 42rem; }
.connection { border: 1px solid var(--border); border-top: 3px solid var(--gold); border-radius: 4px; background: #160d20; }
.review, .account { padding: 2rem; min-width: 0; }
.account { border-top: 1px solid var(--border); background: #100b18; }
.step { color: var(--muted); font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
.step-number { color: var(--gold-light); margin-right: .5rem; }
.client-label { margin-top: 1.5rem; font-size: .8rem; color: var(--muted); }
.client-name { margin-top: .3rem; font-size: 1.5rem; line-height: 1.3; font-weight: 750; color: var(--paper); overflow-wrap: anywhere; }
h2 { font-size: 1.25rem; line-height: 1.35; }
.permissions-title { margin-top: 1.75rem; font-size: 1rem; }
.permissions { list-style: none; padding: 0; margin: .65rem 0 0; }
.permission { padding: .8rem 0; border-bottom: 1px solid var(--border); }
.permission-heading { display: flex; align-items: baseline; justify-content: space-between; gap: .4rem 1rem; flex-wrap: wrap; }
.permission-heading strong { font-size: .9rem; font-weight: 650; }
.permission code { color: var(--gold-light); font-size: .8rem; }
.permission p { color: var(--muted); font-size: .82rem; line-height: 1.5; margin-top: .25rem; }
.restriction { color: var(--muted); font-size: .82rem; margin-top: 1.25rem; }
.account h2:not(.step) { margin-top: 1.5rem; }
.account-intro { margin-top: .5rem; color: var(--muted); font-size: .9rem; }
.fields { display: grid; gap: 1.15rem; margin-top: 1.5rem; }
.field label { display: block; font-size: .9rem; font-weight: 650; margin-bottom: .45rem; }
.field input {
  width: 100%;
  min-width: 0;
  min-height: 3rem;
  padding: .65rem .8rem;
  border: 1px solid #7b658b;
  border-radius: 4px;
  background: var(--ink);
  color: var(--text);
  font-size: 1rem;
}
.field input:hover { border-color: var(--muted); }
.field input:focus-visible { border-color: var(--gold-light); }
.field input:user-invalid { border-color: #ffb4b4; }
.field-error { display: none; color: #ffb4b4; font-size: .8rem; margin-top: .45rem; }
.field input:user-invalid + .field-error { display: block; }
.privacy { color: var(--muted); font-size: .82rem; margin-top: 1rem; }
.actions { display: grid; gap: .75rem; margin-top: 1.75rem; }
.actions button { min-height: 3rem; padding: .75rem 1rem; border-radius: 4px; font-size: .95rem; font-weight: 750; }
.approve { border: 1px solid var(--gold); background: var(--gold-light); color: var(--base); }
.approve:hover { background: #ffe29a; }
.deny { border: 1px solid #7b658b; color: var(--text); background: transparent; }
.deny:hover { background: var(--base-2); border-color: var(--muted); }
.decline-note { margin-top: .9rem; color: var(--muted); font-size: .78rem; text-align: center; }
footer { padding: 1.5rem 0 2.5rem; color: var(--muted); font-size: .8rem; }
@media (min-width: 800px) {
  .connection { display: grid; grid-template-columns: 1.08fr 1fr; align-items: start; }
  .account { border-top: 0; border-left: 1px solid var(--border); align-self: stretch; }
}
@media (max-width: 480px) {
  .shell { width: calc(100% - 2rem); }
  .brand { padding-top: 1.5rem; }
  main { padding-top: 2rem; }
  .review, .account { padding: 1.25rem; }
}
@media (forced-colors: active) {
  .connection, .account, .permission { border-color: CanvasText; }
  .actions button, .field input { border: 1px solid ButtonText; }
  :focus-visible { outline-color: Highlight; }
}
`;

/** Authorize only these exact static CSS bytes; never permit arbitrary inline styles or scripts. */
export const consentStyleSource = `'sha256-${createHash('sha256').update(consentStyles).digest('base64')}'`;
