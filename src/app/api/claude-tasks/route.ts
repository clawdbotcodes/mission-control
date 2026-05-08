import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getClaudeCodeTasks } from '@/lib/claude-tasks'
import { getDatabase } from '@/lib/db'

/**
 * GET /api/claude-tasks — Returns Claude Code teams and tasks
 * Read-only bridge: MC reads from ~/.claude/tasks/ and ~/.claude/teams/
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const force = request.nextUrl.searchParams.get('force') === 'true'
  const result = getClaudeCodeTasks(force)

  // Build a label map: session UUID → "project_name (short-id)"
  const sessionLabels: Record<string, string> = {}
  try {
    const db = getDatabase()
    const teamIds = [...new Set(result.tasks.map(t => t.teamName))]
    if (teamIds.length > 0) {
      const placeholders = teamIds.map(() => '?').join(',')
      const rows = db.prepare(
        `SELECT session_id, project_path, project_slug FROM claude_sessions WHERE session_id IN (${placeholders})`
      ).all(...teamIds) as Array<{ session_id: string; project_path: string | null; project_slug: string | null }>
      for (const row of rows) {
        const projectName = row.project_path
          ? row.project_path.split('/').filter(Boolean).pop()
          : row.project_slug?.split('-').pop()
        const shortId = row.session_id.slice(0, 8)
        sessionLabels[row.session_id] = projectName ? `${projectName} (${shortId})` : shortId
      }
    }
  } catch { /* DB unavailable — fall back to raw UUIDs */ }

  return NextResponse.json({ ...result, sessionLabels })
}
