/**
 * Run one agent stage for an existing run from the terminal, with full logs (bypasses the HTTP server).
 * Usage: npx tsx scripts/run-stage.ts <runId> <icp|research|regenerate> [leadId,leadId]
 */
import { runStage } from '../src/agent.js'
import type { Stage } from '../src/tools/core.js'

const [runId, stage, leads] = process.argv.slice(2)
if (!runId || !['icp', 'research', 'regenerate'].includes(stage)) {
  console.error('usage: npx tsx scripts/run-stage.ts <runId> <icp|research|regenerate> [leadIds]')
  process.exit(1)
}
await runStage(runId, stage as Stage, { leadIds: leads?.split(','), resume: true })
process.exit(0)
