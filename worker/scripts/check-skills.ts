/**
 * Verifies the SDK discovers the five project skills and exposes only the Skill tool + leadAgent tools.
 * Reads the session's init message and aborts before any model call.  Usage: npx tsx scripts/check-skills.ts
 */
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { AGENT_CWD, SKILLS } from '../src/agent.js'

const abort = new AbortController()
const server = createSdkMcpServer({ name: 'leadAgent', version: '1.0.0', tools: [tool('ping', 'ping', { x: z.string() }, async () => ({ content: [{ type: 'text', text: 'pong' }] }))] })

try {
  for await (const m of query({
    prompt: 'noop',
    options: { cwd: AGENT_CWD, settingSources: ['project'], skills: SKILLS, tools: ['Skill'], env: { ...process.env, CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: '1' }, mcpServers: { leadAgent: server }, allowedTools: ['mcp__leadAgent__ping'], permissionMode: 'dontAsk', abortController: abort },
  })) {
    if (m.type === 'system' && m.subtype === 'init') {
      console.log('tools:', m.tools)
      console.log('skills:', (m as any).skills, 'slash:', (m as any).slash_commands?.length)
      const missing = SKILLS.filter((s) => !((m as any).skills ?? []).includes(s))
      console.log(missing.length ? `MISSING skills: ${missing.join(', ')}` : 'all 5 skills discovered')
      abort.abort()
    }
  }
} catch (e) {
  if (!abort.signal.aborted) throw e
}
