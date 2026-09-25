import { createSdkMcpServer, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk'
import type { RunContext, Stage } from './core.js'
import { stateTools } from './state.js'
import { icpAndDiscoveryTools } from './discovery.js'
import { researchTools } from './research.js'
import { outreachTools } from './outreach.js'

export const SERVER_NAME = 'leadAgent'

/** Which tools each session may use. Discovery/scraping cannot exist before the ICP gate. */
const STAGE_TOOLS: Record<Stage, string[]> = {
  icp: ['storePhaseState', 'getPhaseCheckpoint', 'sendErrorAlert', 'storeToolCallRecord', 'refineICP', 'calculateCostEstimate', 'checkApifyBalance'],
  research: [
    'storePhaseState', 'getPhaseCheckpoint', 'sendErrorAlert', 'storeToolCallRecord', 'storeLeadRecord',
    'getDiscoveryFilterOptions', 'apifyDiscoverCompanies', 'listRunLeads', 'firecrawlScrapeWebsite', 'getLeadContext',
    'qualifyLead', 'flagLeadForReview', 'qualityCheckOutreach', 'generateOutreach', 'validateLeadList',
  ],
  regenerate: ['storePhaseState', 'getPhaseCheckpoint', 'sendErrorAlert', 'storeToolCallRecord', 'listRunLeads', 'getLeadContext', 'qualityCheckOutreach', 'generateOutreach', 'validateLeadList'],
}

export function buildLeadAgentServer(ctx: RunContext) {
  const all = {
    ...stateTools(ctx),
    ...icpAndDiscoveryTools(ctx),
    ...researchTools(ctx),
    ...outreachTools(ctx),
  } as unknown as Record<string, SdkMcpToolDefinition<any>>
  const names = STAGE_TOOLS[ctx.stage]
  // alwaysLoad: never defer these behind tool search — the session has no ToolSearch tool, so deferred tools would be unreachable.
  const server = createSdkMcpServer({ name: SERVER_NAME, version: '1.0.0', alwaysLoad: true, tools: names.map((n) => all[n]) })
  return { server, allowedTools: names.map((n) => `mcp__${SERVER_NAME}__${n}`) }
}
