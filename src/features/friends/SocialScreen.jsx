import { IconUser, IconUsers, IconCopy, IconTrophy, IconTrash } from '../../components/Icons.jsx';
import { challengeRecordVs } from '../../utils/challenges.js';
import ProgressCompareSection from '../disputes/ProgressCompareSection.jsx';
import ChallengesSection from '../disputes/ChallengesSection.jsx';

// Экран «Друзья и споры»: карточка с кодом, заявки, список друзей, сравнение прогресса и споры.
export default function SocialScreen({
  uid,
  profileData,
  handleProfileChange,
  myFriendCode,
  notify,
  friendCodeInput,
  setFriendCodeInput,
  sendFriendRequest,
  incomingRequests,
  acceptedFriends,
  friendName,
  otherUid,
  acceptConnection,
  removeConnection,
  openChallengeWith,
  challenges,
  challengeStanding,
  removeChallenge,
  openAcceptChallenge,
  compareProps,
}) {
  return (
    <div className="space-y-5">
      {/* Мой код */}
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconUser className="w-4 h-4" /> Моя карточка</h2>
        <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ИМЯ (видят друзья)</span><input type="text" maxLength={24} placeholder="Как вас зовут" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={profileData.displayName || ''} onChange={(e) => handleProfileChange('displayName', e.target.value)} /></div>
        <div>
          <span className="text-[9px] text-zinc-500 font-bold block mb-1">ВАШ КОД ДЛЯ ДРУЗЕЙ</span>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[#27272a] rounded-xl p-3 font-black text-lg tracking-[0.3em] text-emerald-400 text-center border border-zinc-700/30">{myFriendCode || '—'}</div>
            <button type="button" onClick={() => { if (navigator.clipboard) { navigator.clipboard.writeText(myFriendCode); notify('Код скопирован'); } }} className="btn-active w-12 h-12 shrink-0 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 border border-zinc-700/30" aria-label="Скопировать код"><IconCopy className="w-5 h-5" /></button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1.5">Поделитесь кодом, чтобы вас добавили в друзья.</p>
        </div>
      </div>

      {/* Добавить друга */}
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Добавить друга по коду</h2>
        <div className="flex gap-2">
          <input type="text" placeholder="Код друга" maxLength={6} className="flex-1 min-w-0 bg-[#27272a] rounded-xl p-3 font-black tracking-[0.2em] uppercase text-zinc-200 outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={friendCodeInput} onChange={(e) => setFriendCodeInput(e.target.value.toUpperCase())} />
          <button type="button" onClick={sendFriendRequest} disabled={!friendCodeInput.trim()} className="btn-active px-4 shrink-0 bg-emerald-600 text-white rounded-xl font-bold transition-all disabled:opacity-35">Добавить</button>
        </div>
      </div>

      {/* Входящие заявки */}
      {incomingRequests.length > 0 && (
        <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
          <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Заявки в друзья ({incomingRequests.length})</h2>
          {incomingRequests.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2 bg-[#27272a] rounded-xl p-3 border border-zinc-700/30">
              <span className="text-sm font-bold text-zinc-200 truncate">{friendName(otherUid(c))}</span>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => acceptConnection(c)} className="btn-active bg-emerald-600 text-white rounded-lg px-3 py-2 text-xs font-bold">Принять</button>
                <button type="button" onClick={() => removeConnection(c)} className="btn-active bg-zinc-800 text-zinc-400 rounded-lg px-3 py-2 text-xs font-bold">Отклонить</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Друзья */}
      <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconUsers className="w-4 h-4" /> Друзья ({acceptedFriends.length})</h2>
          {acceptedFriends.length > 0 && <button type="button" onClick={() => openChallengeWith('')} className="btn-active flex items-center gap-1.5 bg-emerald-600 text-white rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-widest"><IconTrophy className="w-4 h-4" /> Новый спор</button>}
        </div>
        {acceptedFriends.length === 0 && <p className="text-xs text-zinc-500">Пока нет друзей. Добавьте по коду — и спорьте, кто быстрее придёт к цели.</p>}
        {acceptedFriends.map(c => {
          const fid = otherUid(c);
          const rec = challengeRecordVs(challenges, uid, fid);
          const hasRec = rec.wins + rec.losses + rec.ties > 0;
          return (
            <div key={c.id} className="flex items-center justify-between gap-2 bg-[#27272a] rounded-xl p-3 border border-zinc-700/30">
              <div className="min-w-0">
                <span className="text-sm font-bold text-zinc-200 block truncate">{friendName(fid)}</span>
                {hasRec
                  ? <span className="text-[10px] text-zinc-400 font-bold">Счёт: <span className="text-emerald-400">{rec.wins}</span> : <span className="text-red-400">{rec.losses}</span>{rec.ties ? <span className="text-zinc-500"> · {rec.ties} нич.</span> : null}</span>
                  : <span className="text-[10px] text-zinc-500">Показатели видны только в общем споре</span>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => openChallengeWith(fid)} className="btn-active bg-emerald-600/15 text-emerald-300 border border-emerald-600/30 rounded-lg px-3 py-2 text-xs font-bold">Спорить</button>
                <button type="button" onClick={() => removeConnection(c)} className="btn-active text-zinc-700 active:text-red-400 p-2"><IconTrash className="w-5 h-5" /></button>
              </div>
            </div>
          );
        })}
      </div>

      <ProgressCompareSection
        acceptedFriends={acceptedFriends}
        otherUid={otherUid}
        friendName={friendName}
        {...compareProps}
      />

      <ChallengesSection
        challenges={challenges}
        challengeStanding={challengeStanding}
        uid={uid}
        onRemoveChallenge={removeChallenge}
        onAcceptChallenge={openAcceptChallenge}
      />
    </div>
  );
}
