/**
 * Offline evaluation of ticket triage against a labelled set (scripts/eval/cases.json —
 * the brief's 7 sample queries plus 15 more, including legal threats and tricky tie-breaks).
 *
 *   npm run eval:ai              # uses the configured LLM (ANTHROPIC_API_KEY / OPENAI_API_KEY)
 *   npm run eval:ai -- --fallback  # evaluates the rule-based fallback classifier instead
 *   npm run eval:ai -- --set heldout   # the held-out set (24 cases never used for prompt tuning)
 *
 * Reports category accuracy, priority accuracy (exact and within one level), token usage and an
 * estimated cost per 1,000 tickets — the numbers to quote when discussing quality vs. cost, and a
 * regression check whenever the prompt in src/ai/prompts.ts changes.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { buildTriageContext } from '../src/ai/context.js';
import { fallbackClassify } from '../src/ai/fallback-classifier.js';
import { getProvider } from '../src/ai/providers/index.js';
import { triageOutputSchema, triageTool } from '../src/ai/schemas.js';
import { env } from '../src/config/env.js';
import { applyPriorityPolicy } from '../src/domain/priority-policy.js';
import type { Category, Priority } from '../src/config/constants.js';

interface Case { id: string; subject: string; description: string; category: Category; priority: Priority }
// `--set heldout` scores eval/heldout.json: cases written *after* the prompts were tuned and never used to tune them.
const setName = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : 'cases';
if (setName !== 'cases' && setName !== 'heldout') throw new Error(`Unknown --set "${setName}" (use cases | heldout)`);
const cases: Case[] = JSON.parse(readFileSync(new URL(`./eval/${setName}.json`, import.meta.url), 'utf8'));
const rank: Record<Priority, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const useFallback = process.argv.includes('--fallback');

const provider = getProvider();
if (!useFallback && !provider) {
  console.error('No LLM configured. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) in server/.env, or pass --fallback.');
  process.exit(1);
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
let catOk = 0, prioExact = 0, prioNear = 0, inTok = 0, outTok = 0, failures = 0;

console.log(`\nTriage evaluation (${setName}) — ${useFallback ? 'rule-based fallback' : `${provider!.name}/${provider!.model}`} — ${cases.length} cases\n`);
console.log(`${pad('case', 22)} ${pad('expected', 34)} ${pad('got', 34)} ok`);

for (const c of cases) {
  let category: Category, priority: Priority;
  try {
    if (useFallback) {
      ({ category, priority } = fallbackClassify(c.subject, c.description));
    } else {
      const ctx = buildTriageContext({
        subject: c.subject,
        description: c.description,
        author: { name: 'Eval Author', authorCode: 'EVAL', joinedDate: new Date() },
        books: [],
        ticketBook: null,
        thread: [],
        now: new Date(),
      });
      const r = await provider!.callStructured({ system: ctx.system, user: ctx.user, tool: triageTool, maxTokens: 200, temperature: 0 });
      inTok += r.inputTokens;
      outTok += r.outputTokens;
      const out = triageOutputSchema.parse(r.data);
      category = out.category;
      priority = applyPriorityPolicy({ category, aiPriority: out.priority, text: `${c.subject}\n${c.description}`, royaltyOverdue: false }).priority;
    }
  } catch (err) {
    failures++;
    console.log(`${pad(c.id, 22)} ${pad(`${c.category} / ${c.priority}`, 34)} ${pad(`ERROR ${(err as Error).message}`, 34)} ✗`);
    continue;
  }
  const cOk = category === c.category;
  const exact = priority === c.priority;
  const near = Math.abs(rank[priority] - rank[c.priority]) <= 1;
  catOk += +cOk; prioExact += +exact; prioNear += +near;
  console.log(`${pad(c.id, 22)} ${pad(`${c.category} / ${c.priority}`, 34)} ${pad(`${category} / ${priority}`, 34)} ${cOk && exact ? '✓' : cOk && near ? '~' : '✗'}`);
}

const n = cases.length;
const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`;
console.log(`\nCategory accuracy:          ${catOk}/${n} (${pct(catOk)})`);
console.log(`Priority exact match:       ${prioExact}/${n} (${pct(prioExact)})`);
console.log(`Priority within one level:  ${prioNear}/${n} (${pct(prioNear)})`);
if (failures) console.log(`Call failures:              ${failures}`);
if (!useFallback && n - failures > 0) {
  const ok = n - failures;
  const cost = (inTok * env.llm.priceInPerMTok + outTok * env.llm.priceOutPerMTok) / 1e6;
  console.log(`Avg tokens per ticket:      ${Math.round(inTok / ok)} in / ${Math.round(outTok / ok)} out`);
  console.log(`Estimated cost:             $${cost.toFixed(4)} for ${ok} tickets  →  ≈ $${((cost / ok) * 1000).toFixed(2)} per 1,000 tickets`);
}
console.log('');
