/** Prints the leadAgent MCP server status and registered tools for a stage, without a model call. */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { AGENT_CWD, SKILLS } from '../src/agent.js'
import { createContext, type Stage } from '../src/tools/core.js'
import { buildLeadAgentServer } from '../src/tools/index.js'

const [runId, stage = 'icp'] = process.argv.slice(2)
const abort = new AbortController()
const ctx = await createContext(runId, stage as Stage, abort, {})
const { server, allowedTools } = buildLeadAgentServer(ctx)
try {
  for await (const m of query({ prompt: 'noop', options: { cwd: AGENT_CWD, settingSources: ['project'], skills: SKILLS, tools: ['Skill'], mcpServers: { leadAgent: server }, strictMcpConfig: true, allowedTools, permissionMode: 'dontAsk', abortController: abort, env: { ...process.env, CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: '1' } } })) {
    if (m.type === 'system' && m.subtype === 'init') {
      console.log('mcp_servers:', JSON.stringify((m as any).mcp_servers))
      console.log('tools:', m.tools)
      abort.abort()
    }
  }
} catch (e) { if (!abort.signal.aborted) throw e }
process.exit(0)
