import { BookOpen, CookingPot, MapPin, UsersRound } from 'lucide-react';

const icons = {
  cooking: CookingPot,
  meeting: UsersRound,
  reading: BookOpen,
  outing: MapPin,
};

export function ActivityGlyph({ activityId, size = 'default' }: { activityId: string; size?: 'default' | 'large' }) {
  const Icon = icons[activityId as keyof typeof icons] || BookOpen;
  return (
    <span className={`activity-glyph activity-glyph-${activityId} ${size === 'large' ? 'activity-glyph-large' : ''}`} aria-hidden="true">
      <Icon strokeWidth={1.35} />
    </span>
  );
}
