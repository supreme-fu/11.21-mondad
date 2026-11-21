import { ArrowRight, Coins, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { ActivityGlyph } from '@/components/ActivityGlyph';
import { useApp } from '@/context/AppContext';
import '../App.css';

export default function Home() {
  const { activities, records, user } = useApp();
  const completedTotal = records.filter((item) => item.completion !== null).length;

  return (
    <section className="themes-section themes-section-clean page-container" id="themes">
      <div className="home-compact-head">
        <div>
          <p className="eyebrow">你好，{user?.displayName} · 今天可以做的小事</p>
          <h1 className="home-compact-title">哪一件，已经在心里放了很久？</h1>
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

      <div className="activity-list">
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
            return (
              <Link to={`/activities/${activity.id}`} className="activity-row" key={activity.id}>
                <ActivityGlyph activityId={activity.id} />
                <div className="activity-row-copy">
                  <div className="activity-meta"><span>{activity.category}</span><span>{activity.duration}</span></div>
                  <h3>{activity.title}</h3>
                  <p>{activity.invitation}</p>
                </div>
                <div className="activity-row-action">
                  {statusBadge && <span className="badge">{statusBadge}</span>}
                  <span className="activity-arrow"><ArrowRight /></span>
                </div>
              </Link>
            );
          })}
      </div>
    </section>
  );
}
