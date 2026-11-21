import { ArrowRight, BookOpen, Check, Coins, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { ActivityGlyph } from '@/components/ActivityGlyph';
import { useApp } from '@/context/AppContext';
import '../App.css';

function MeetingMark() {
  return (
    <div className="meeting-mark" aria-label="两条独立的生活轨迹，在完成后相遇">
      <svg viewBox="0 0 520 420" role="img" aria-hidden="true">
        <path className="path-one" d="M30 318C110 354 136 266 188 236C246 202 263 151 329 125C389 102 428 116 492 55" />
        <path className="path-two" d="M38 84C116 47 151 119 203 163C253 205 298 207 340 254C386 305 422 340 490 322" />
        <circle className="meeting-dot" cx="262" cy="198" r="11" />
        <circle className="orbit-dot" cx="329" cy="125" r="5" />
        <circle className="orbit-dot" cx="203" cy="163" r="5" />
      </svg>
      <div className="path-note path-note-one"><Check />我按自己的方式完成了</div>
      <div className="path-note path-note-two">原来，你也回应了这件事</div>
      <span className="mark-caption">不必同步出发，也能彼此照亮</span>
    </div>
  );
}

export default function Home() {
  const { activities, records, user } = useApp();
  const completedTotal = records.filter((item) => item.completion !== null).length;

  return (
    <>
      <section className="home-hero home-hero-polished page-container">
        <div className="hero-copy">
          <p className="eyebrow">给“改天”一个轻轻的结尾</p>
          <h1>想做，很久了。<br /><em>今天，轻轻开始。</em></h1>
          <p className="hero-description">
            一件真正想做的事，一个只属于自己的约定。不用找搭子，不必连续打卡；先去生活，再决定要不要留下故事。
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#themes">选一件想做的事<ArrowRight /></a>
            <a className="text-link" href="/intro.html#after-action">为什么在完成之后相遇？</a>
          </div>
          <ul className="hero-assurances" aria-label="产品原则">
            <li><Check />独立行动</li>
            <li><Check />分享由你</li>
            <li><Check />没有排名</li>
          </ul>
        </div>
        <MeetingMark />
      </section>

      <section className="themes-section themes-section-editorial page-container" id="themes">
        <div className="home-compact-head">
          <div>
            <p className="eyebrow">你好，{user?.displayName} · 今天可以做的小事</p>
            <h2 className="home-compact-title">哪一件，已经在心里放了很久？</h2>
          </div>
          <div className="home-quick-stats">
            <Link to="/records" className="home-stat-chip">
              <Sparkles size={14} aria-hidden="true" />
              <span>已完成 <strong>{completedTotal}</strong> 次</span>
            </Link>
            <Link to="/records" className="home-stat-chip">
              <Coins size={14} aria-hidden="true" />
              <span>余额 <strong>{user?.points ?? 100}</strong> 点</span>
            </Link>
          </div>
        </div>

        <div className="activity-card-grid">
          {[...activities]
            .sort((a, b) => (a.id === 'reading' ? -1 : b.id === 'reading' ? 1 : 0))
            .map((activity) => {
              const themeRecords = records.filter((item) => item.activity.id === activity.id);
              const activeRecord = themeRecords.find((item) => item.participationStatus === 'joined' && !item.completion);
              const completedCount = themeRecords.filter((item) => item.completion !== null).length;
              const statusBadge = activeRecord
                ? '已约定'
                : completedCount === 1
                  ? '已完成 · 1 次'
                  : completedCount > 1
                    ? `已完成 ${completedCount} 次`
                    : null;
              const isReading = activity.id === 'reading';
              return (
                <Link
                  to={`/activities/${activity.id}`}
                  className={`activity-card ${isReading ? 'is-featured-reading' : ''}`}
                  key={activity.id}
                >
                  <div className="activity-card-top">
                    <ActivityGlyph activityId={activity.id} />
                    <div className="activity-card-badges">
                      {isReading && (
                        <span className="badge activity-feature-chip">
                          <BookOpen size={12} aria-hidden="true" />
                          《小王子》共读
                        </span>
                      )}
                      {statusBadge && <span className="badge">{statusBadge}</span>}
                    </div>
                  </div>
                  <div className="activity-card-body">
                    <div className="activity-meta">
                      <span>{activity.category}</span>
                      <span>{activity.duration}</span>
                    </div>
                    <h3>{activity.title}</h3>
                    <p>{activity.invitation}</p>
                  </div>
                  <div className="activity-card-foot">
                    <span>{activeRecord ? '继续这个约定' : isReading ? '打开《小王子》并开始' : '进入这个约定'}</span>
                    <span className="activity-arrow"><ArrowRight size={16} /></span>
                  </div>
                </Link>
              );
            })}
        </div>
      </section>

      <section className="home-closing home-closing-compact page-container">
        <p>“先独自去生活，完成之后，再在自愿留下的字条里轻轻重逢。”</p>
        <div className="home-closing-links">
          <Link to="/records" className="text-link">查看我的徽章与档案<ArrowRight /></Link>
          <a href="/intro.html" className="text-link">阅读完整官网介绍<ArrowRight /></a>
        </div>
      </section>
    </>
  );
}
