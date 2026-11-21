import { ArrowRight, BookOpen, Coins, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { ActivityGlyph } from '@/components/ActivityGlyph';
import { PoeticScrollStory } from '@/components/PoeticScrollStory';
import { useApp } from '@/context/AppContext';
import '../App.css';

export default function Home() {
  const { activities, records, user } = useApp();
  const completedTotal = records.filter((item) => item.completion !== null).length;

  function scrollToThemes() {
    document.getElementById('themes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <PoeticScrollStory onJumpToThemes={scrollToThemes} />

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
