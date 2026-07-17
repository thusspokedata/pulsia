import type { CardioActivity } from "@pulsia/shared";
import type { SessionListItem } from "../api/sessions";

export type TimelineItem =
  | { kind: "session"; id: string; startedAt: number; session: SessionListItem }
  | { kind: "cardio"; id: string; startedAt: number; activity: CardioActivity };

// Línea de tiempo unificada del historial (fuerza + cardio), más reciente primero.
export function buildTimeline(sessions: SessionListItem[], activities: CardioActivity[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...sessions.map((s): TimelineItem => ({ kind: "session", id: s.id, startedAt: s.startedAt, session: s })),
    ...activities.map((a): TimelineItem => ({ kind: "cardio", id: a.id, startedAt: a.startedAt, activity: a })),
  ];
  return items.sort((a, b) => b.startedAt - a.startedAt);
}
