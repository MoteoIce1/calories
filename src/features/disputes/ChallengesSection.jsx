import { IconTrophy } from '../../components/Icons.jsx';
import ChallengeCard from './ChallengeCard.jsx';

// Списки активных и завершённых споров.
export default function ChallengesSection({ challenges, challengeStanding, uid, onRemoveChallenge, onAcceptChallenge }) {
  const sorted = [...challenges].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const active = sorted.filter(c => c.status !== 'finished' && c.status !== 'cancelled');
  const archived = sorted.filter(c => c.status === 'finished' || c.status === 'cancelled');
  const renderCard = (c) => (
    <ChallengeCard key={c.id} challenge={c} standing={challengeStanding(c)} uid={uid} onRemove={onRemoveChallenge} onAccept={onAcceptChallenge} />
  );
  return (
    <>
      {active.length > 0 && (
        <div className="space-y-3">
          <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconTrophy className="w-4 h-4" /> Активные споры ({active.length})</h2>
          {active.map(renderCard)}
        </div>
      )}
      {archived.length > 0 && (
        <div className="space-y-3">
          <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconTrophy className="w-4 h-4" /> История споров ({archived.length})</h2>
          {archived.map(renderCard)}
        </div>
      )}
    </>
  );
}
