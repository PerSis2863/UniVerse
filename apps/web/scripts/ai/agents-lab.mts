// The app agents' instructions and answer shapes, exactly as the website asks (src/server/agents/playbooks.ts), for the
// training kit (scripts/ai/agents-ai.py, M437): {kind: {system, schema, rule}}; `rule` is the JSON line the own model gets.
import { AGENTS, jsonRule, jsonSchema, type AgentKind } from '../../src/server/agents/playbooks';

const out = Object.fromEntries((Object.keys(AGENTS) as AgentKind[]).map((k) => [k, { system: AGENTS[k].system, schema: jsonSchema(AGENTS[k].schema), rule: jsonRule(k) }]));
process.stdout.write(JSON.stringify(out) + '\n');
