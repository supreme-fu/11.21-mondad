import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Boxes, Check, ExternalLink, Eye, EyeOff, FileKey2, LoaderCircle, LockKeyhole, RefreshCw, RotateCcw, Sparkles, Trash2, Waypoints } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ActivityGlyph } from '@/components/ActivityGlyph';
import { BadgeViewerDialog } from '@/components/BadgeViewerDialog';
import { HoloBadgeCard } from '@/components/HoloBadgeCard';
import { ReadingChallengePanel } from '@/components/ReadingChallengePanel';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { api } from '@/lib/api';
import { badgeIdForActivity, loadBadges, type Badge } from '@/lib/badges';
import type { Completion, Echo, RecordItem } from '@/types';

function ReflectionEditor({ completion, onSaved }: { completion: Completion; onSaved: () => Promise<void> }) {
  const [text, setText] = useState(completion.reflection.text || '');
  const [shared, setShared] = useState(completion.reflection.visibility === 'shared');
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setText(completion.reflection.text || '');
    setShared(completion.reflection.visibility === 'shared');
  }, [completion.reflection.text, completion.reflection.visibility, completion.reflection.deletedAt]);

  async function save() {
    if (text.length > 500) { setError('感受最多 500 字，请稍微精简。'); return; }
    if (shared && !text.trim()) { setError('愿意分享时，请先写下一句感受；也可以保持仅自己可见。'); return; }
    setPending(true); setError('');
    try {
      await api.saveReflection(completion.id, text, shared ? 'shared' : 'private');
      await onSaved();
      toast.success(shared ? '感受已保存，并允许同主题的完成者看到。' : '感受已保存，仅自己可见。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败。'); }
    finally { setPending(false); }
  }

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setPending(true); setError('');
    try {
      await api.deleteReflection(completion.id);
      setText(''); setShared(false); setConfirmDelete(false);
      await onSaved();
      toast.success('正文已从服务端删除，分享资格也已撤回。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败。'); }
    finally { setPending(false); }
  }

  return (
    <section className="reflection-editor" aria-labelledby="reflection-title">
      <div className="panel-heading"><div><span className="eyebrow">可选，不影响完成</span><h2 id="reflection-title">留一句此刻的感受</h2></div><PenLineIcon /></div>
      <label htmlFor="reflection-text">你的感受（最多 500 字）</label>
      <textarea id="reflection-text" className="form-field reflection-textarea" value={text} maxLength={500} onChange={(event) => { setText(event.target.value); setConfirmDelete(false); }} placeholder="可以不写。如果愿意，留下一句给未来的自己……" />
      <div className="character-count">{text.length} / 500</div>
      <label className="check-label share-check">
        <input type="checkbox" checked={shared} onChange={(event) => { setShared(event.target.checked); setConfirmDelete(false); }} />
        <span><strong>允许完成同一主题的人看到这段话</strong><small>默认关闭。不会公开昵称之外的个人资料，也不会进入陌生人广场。</small></span>
      </label>
      <div className="visibility-note">{shared ? <Eye /> : <EyeOff />}<span>{shared ? '保存后，其他同主题完成者可能看到这段文字。你随时可以撤回。' : '当前仅自己可见。私密正文不会用于制造相似经历。'}</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <Button onClick={() => void save()} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : '保存感受与分享选择'}</Button>
        {(completion.reflection.text || text) && <Button variant="ghost" onClick={() => void remove()} disabled={pending}><Trash2 />{confirmDelete ? '再次点击，确认删除正文' : '删除正文'}</Button>}
      </div>
      {confirmDelete && <p className="form-error" role="alert">删除会清空服务端正文并停止分享；已存在的链上随机凭证不包含这段文字。</p>}
    </section>
  );
}

function PenLineIcon() {
  return <span className="soft-icon"><Waypoints /></span>;
}

function ReceiptPanel({ completion, onChanged }: { completion: Completion; onChanged: () => Promise<void> }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const receipt = completion.receipt;
  const isSimulation = receipt.mode === 'simulation';
  const statusLabels = {
    not_requested: '尚未申请', queued: '等待登记', submitted: isSimulation ? '模拟登记处理中' : '交易已提交，等待确认',
    confirmed: isSimulation ? '本地模拟已登记（非链上）' : '完成声明已登记', failed: '登记失败，完成仍然有效',
  };

  async function requestReceipt() {
    if (!acknowledged) { setError('请先确认你理解凭证的公开与删除边界。'); return; }
    setPending(true); setError('');
    try {
      await api.requestReceipt(completion.id);
      await onChanged();
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        const current = await api.receipt(completion.id);
        if (current.status === 'confirmed' || current.status === 'failed') break;
      }
      await onChanged();
      toast.success(isSimulation ? '本地模拟登记已完成，没有产生真实链上交易。' : '凭证登记状态已更新。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '登记暂时失败。'); }
    finally { setPending(false); }
  }

  return (
    <section className="receipt-panel" aria-labelledby="receipt-title">
      <div className="panel-heading"><div><span className="eyebrow">独立申请，不自动上链</span><h2 id="receipt-title">完成凭证</h2></div><FileKey2 /></div>
      <div className={`receipt-status receipt-${receipt.status}`}><span className="status-dot" />{statusLabels[receipt.status]}</div>
      <p className="receipt-explanation">只登记服务端生成的随机 32 字节编号。不包含姓名、活动名、正文、正文哈希、图片或定位。</p>
      <p className="receipt-sponsorship-note">
        <strong>无感代付 · 零弹窗打扰：</strong>由服务端采用 Monad 紧凑 <code>gas_limit</code>（单次成本 &lt; $0.0003）在后台静默上链；个人日常记录划扣「链上生活胶卷」（新人赠 10 次 / $6 装填 60 次），购书共读与景区门票核销由合作方全额代付。
      </p>
      {receipt.receiptId && <div className="receipt-id"><span>凭证编号</span><code title={receipt.receiptId}>{receipt.receiptId.slice(0, 10)}…{receipt.receiptId.slice(-8)}</code></div>}
      {receipt.status === 'confirmed' && receipt.txHash && <div className="receipt-id"><span>{isSimulation ? '模拟标识' : '交易哈希'}</span><code title={receipt.txHash}>{receipt.txHash.slice(0, 12)}…{receipt.txHash.slice(-6)}</code></div>}
      {!isSimulation && receipt.txHash?.startsWith('0x') && <a className="text-link" href={`https://testnet.monadvision.com/tx/${receipt.txHash}`} target="_blank" rel="noreferrer">在 MonadVision 查看<ExternalLink /></a>}
      {(receipt.status === 'not_requested' || receipt.status === 'failed') && <>
        <label className="check-label receipt-consent"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>我理解：{isSimulation ? '当前仅生成本地模拟记录，不是真实链上交易。' : '真实测试网的随机编号、交易时间和提交地址确认后无法由平台删除；正文不会上链。'}</span></label>
        <Button variant="outline" onClick={() => void requestReceipt()} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : receipt.status === 'failed' ? <RotateCcw /> : <FileKey2 />}{receipt.status === 'failed' ? '使用同一编号重试' : isSimulation ? '申请本地模拟凭证' : '申请测试网凭证'}</Button>
      </>}
      {(receipt.status === 'queued' || receipt.status === 'submitted' || pending) && <p className="processing-note"><LoaderCircle className="animate-spin" />正在更新状态，完成不会受登记结果影响。</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {receipt.error && <p className="form-error" role="alert">{receipt.error}</p>}
    </section>
  );
}

function EchoPanel({ activityId }: { activityId: string }) {
  const [echo, setEcho] = useState<Echo | null>(null);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let active = true;
    api.echo(activityId)
      .then((result) => {
        if (!active) return;
        setEcho(result.echo);
        setTotalAvailable(result.totalAvailable ?? (result.echo ? 1 : 0));
      })
      .catch(() => {
        if (!active) return;
        setEcho(null);
        setTotalAvailable(0);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activityId]);

  async function nextEcho() {
    if (switching) return;
    setSwitching(true);
    try {
      const result = await api.echo(activityId, echo?.text);
      setEcho(result.echo);
      setTotalAvailable(result.totalAvailable ?? (result.echo ? 1 : 0));
    } catch {
      toast.error('暂时没有翻出新的字条，请稍后再试。');
    } finally {
      setSwitching(false);
    }
  }

  return (
    <section className="echo-panel" aria-live="polite">
      <div className="echo-visual" aria-hidden="true">
        <svg viewBox="0 0 240 240" role="presentation">
          <path className="echo-curve-one" d="M 18 192 C 74 178, 96 128, 124 118 C 156 106, 184 68, 222 44" />
          <path className="echo-curve-two" d="M 22 54 C 72 68, 96 108, 124 118 C 154 128, 182 168, 220 190" />
          <circle className="echo-node-outer" cx="124" cy="118" r="14" />
          <circle className="echo-node-core" cx="124" cy="118" r="5.5" />
        </svg>
      </div>
      <div className="echo-content">
        <span className="eyebrow">行动之后，一段经历与你相遇</span>
        <h2>原来，也有人回应了这件事。</h2>
        {loading ? (
          <p><LoaderCircle className="animate-spin" />正在翻看同路人留下的字条…</p>
        ) : echo ? (
          <blockquote>
            <p>“{echo.text}”</p>
            <footer>
              <span>{echo.displayName}</span>
              {echo.isExample && <span className="badge badge-coral">示例内容</span>}
              {totalAvailable > 1 && (
                <button
                  type="button"
                  className="echo-next-btn"
                  onClick={() => void nextEcho()}
                  disabled={switching}
                >
                  {switching ? <LoaderCircle className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
                  再翻看一张同路人的字条
                </button>
              )}
            </footer>
          </blockquote>
        ) : (
          <p className="echo-empty">这里暂时还没有可展示的经历。你的私密记录不会被用来填补空白。</p>
        )}
        <p className="echo-boundary"><LockKeyhole />这里只停留同主题下自愿敞开的文字。不必寒暄，看见即是重逢。</p>
      </div>
    </section>
  );
}

export default function CompletionPage() {
  const { participationId = '' } = useParams();
  const { records, refreshRecords } = useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [badges, setBadges] = useState<Badge[]>([]);
  const [activeBadge, setActiveBadge] = useState<Badge | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const record: RecordItem | undefined = records.find((item) => item.participationId === participationId);

  useEffect(() => {
    let active = true;
    loadBadges().then((loaded) => { if (active) setBadges(loaded); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const { ordinal, themeCompletedCount } = useMemo(() => {
    if (!record) return { ordinal: 1, themeCompletedCount: 0 };
    const sameThemeCompleted = records
      .filter((item) => item.activity.id === record.activity.id && item.completion !== null)
      .sort((a, b) => new Date(a.completion!.declaredAt).getTime() - new Date(b.completion!.declaredAt).getTime());
    const index = sameThemeCompleted.findIndex((item) => item.participationId === record.participationId);
    return {
      ordinal: index >= 0 ? index + 1 : sameThemeCompleted.length,
      themeCompletedCount: sameThemeCompleted.length,
    };
  }, [record, records]);

  const syncRecord = useCallback(async () => {
    await refreshRecords();
  }, [refreshRecords]);

  const handleSelectBadge = useCallback((badge: Badge, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setActiveBadge(badge);
  }, []);

  async function complete() {
    setPending(true); setError('');
    try {
      await api.complete(participationId, idempotencyKey.current);
      await syncRecord();
      toast.success('这件事已经算数。不需要任何额外证明。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '暂时无法保存完成声明。'); }
    finally { setPending(false); }
  }

  if (!record) return <div className="empty-state page-container"><h1>没有找到这条约定</h1><p>它可能属于另一个演示账户，或已经离开。</p><Link className="primary-link" to="/">返回主题列表</Link></div>;

  if (!record.completion) return (
    <div className="declare-page page-container">
      <Link to={`/activities/${record.activity.id}`} className="back-link"><ArrowLeft />返回主题详情</Link>
      <div className="declare-layout"><div><ActivityGlyph activityId={record.activity.id} size="large" /><span className="eyebrow">不需要照片，不需要证明</span><h1>先承认：<br />你已经去做了。</h1><p>{record.activity.completionHint}</p></div>
        <section className="declare-card"><span className="soft-icon"><Check /></span><h2>我完成了「{record.activity.title}」</h2><p>点击后只为你记下这次行动，不会自动公开感受，也不强制生成链上凭证。</p>{error && <p className="form-error" role="alert">{error}</p>}<Button size="lg" onClick={() => void complete()} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <>确认我已完成<ArrowRight /></>}</Button><small>即使之后登记失败，这次完成也依然有效。</small></section>
      </div>
    </div>
  );

  const completion = record.completion;
  const themeBadgeId = badgeIdForActivity(record.activity.id);
  const themeBadge = themeBadgeId ? badges.find((item) => item.id === themeBadgeId) : undefined;
  const contractBadge = badges.find((item) => item.id === 'contract');
  const receiptConfirmed = completion.receipt.status === 'confirmed';

  return (
    <div className="completion-page page-container">
      <Link to={`/activities/${record.activity.id}`} className="back-link"><ArrowLeft />返回主题详情</Link>
      <header className="completion-header">
        <div>
          <span className="badge">
            <Check />
            自报完成 · 无需自证{themeCompletedCount > 0 ? ` · 本主题第 ${ordinal} 次完成` : ''}
          </span>
          <h1>这件事，已经算数。</h1>
          <p>「{record.activity.title}」不要求你再证明什么。接下来的记录与分享，都由你决定。</p>
        </div>
        <ActivityGlyph activityId={record.activity.id} size="large" />
      </header>

      <EchoPanel key={`${completion.reflection.visibility}-${completion.reflection.deletedAt}`} activityId={record.activity.id} />

      {themeBadge && (
        <section className="completion-badge-spotlight" aria-labelledby="spotlight-badge-title">
          <div className="completion-badge-copy">
            <span className="eyebrow">
              <Sparkles aria-hidden="true" />
              本次行动点亮的纪念器物
            </span>
            <h2 id="spotlight-badge-title">
              「{themeBadge.name}」已为你的生活档案点亮
            </h2>
            <p>
              这是你在「{record.activity.title}」主题下累计第 {Math.max(1, themeCompletedCount)} 次回应。点击右侧器物，可 360° 旋转查看它的材质细节，并阅读你的行动溯源与跨应用门户设想。
            </p>
            <div className="completion-badge-actions">
              <Button
                type="button"
                variant="default"
                onClick={(event) => handleSelectBadge(themeBadge, event.currentTarget)}
              >
                <Boxes aria-hidden="true" />
                旋转赏鉴「{themeBadge.name}」3D 器物
              </Button>
              {receiptConfirmed && contractBadge && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={(event) => handleSelectBadge(contractBadge, event.currentTarget)}
                >
                  <FileKey2 aria-hidden="true" />
                  查看已点亮的「链上完成」3D 器物
                </Button>
              )}
            </div>
          </div>
          <div className="completion-badge-card-wrap">
            <HoloBadgeCard
              badge={themeBadge}
              onSelect={handleSelectBadge}
              unlocked
              count={Math.max(1, themeCompletedCount)}
            />
          </div>
        </section>
      )}

      <div className="completion-panels"><ReflectionEditor completion={completion} onSaved={syncRecord} /><ReceiptPanel completion={completion} onChanged={syncRecord} /></div>

      {record.activity.id === 'reading' && (
        <ReadingChallengePanel
          participationId={record.participationId}
          completionId={completion.id}
          reflectionText={completion.reflection.text}
          reflectionDeletedAt={completion.reflection.deletedAt}
          onRecordChanged={syncRecord}
        />
      )}

      <div className="completion-footer">
        <LockKeyhole />
        <p>正文与凭证分开保存。删除正文不会声称撤销现实行为，也不会声称抹除已确认的公开链历史。</p>
        <div className="completion-footer-links">
          <Link to={`/activities/${record.activity.id}`} className="text-link">再去回应一次这个约定<ArrowRight /></Link>
          <Link to="/records" className="text-link">查看我的档案<ArrowRight /></Link>
        </div>
      </div>

      <BadgeViewerDialog
        badge={activeBadge}
        onClose={() => setActiveBadge(null)}
        restoreFocusTo={() => triggerRef.current?.focus()}
      />
    </div>
  );
}
