export const SNAPS_SHOT_POINTS = 5
export const SNAPS_MISSION_TITLE = 'Snaps'
export const SNAPS_SUBMISSION_SOURCE = 'snaps'

export type SnapsTeam = {
  id: string
  name: string
  color: string
  heroGradientCss: string
  heroImageUrl: string | null
  avatarUrl: string | null
}

export type SnapsActivityItem = {
  id: string
  teamId: string
  teamName: string
  teamColor: string
  points: number
  createdAt: string
  undone: boolean
}

export type SnapsTeamsResponse =
  | {
      ok: true
      teams: SnapsTeam[]
      recentActivity: SnapsActivityItem[]
    }
  | { ok: false; error: string }

export type SnapsAwardResponse =
  | {
      ok: true
      team: SnapsTeam
      activity: SnapsActivityItem
    }
  | { ok: false; error: string }

export type SnapsUndoResponse =
  | {
      ok: true
      team: SnapsTeam
      activityId: string
    }
  | { ok: false; error: string }
