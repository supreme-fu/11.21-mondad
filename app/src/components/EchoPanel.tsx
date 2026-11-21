import { useEffect, useState } from 'react';
import { LoaderCircle, LockKeyhole, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Echo } from '@/types';

export function EchoPanel({ activityId }: { activityId: string }) {
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
    <section className="echo-panel" aria-live="polite" data-testid="echo-panel">
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
                  data-testid="echo-next-btn"
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
