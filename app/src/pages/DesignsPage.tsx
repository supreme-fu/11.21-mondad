import { ArrowRight, Check, CloudSun, MoonStar, Newspaper, Palette, Scissors } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useApp, type ThemeName } from '@/context/AppContext';

const themes: Array<{
  id: ThemeName;
  name: string;
  english: string;
  description: string;
  detail: string;
  icon: typeof Newspaper;
}> = [
  { id: 'editorial', name: '生活编辑部', english: 'Living Editorial', description: '青白纸面、文学标题与编辑留白。', detail: '安静、克制，让主题和人的感受成为主角。', icon: Newspaper },
  { id: 'night', name: '夜色回信', english: 'Letters After Dark', description: '深蓝夜色、暖琥珀与两条微光轨迹。', detail: '适合夜间独处，强调偶然相遇的沉浸感。', icon: MoonStar },
  { id: 'paper', name: '纸片行动', english: 'Paper Actions', description: '冷白底、鲜明色彩与轻盈的纸片层次。', detail: '更年轻直接，保留行动温度，不制造奖励压力。', icon: Scissors },
  { id: 'cream', name: '奶油温柔', english: 'Cream & Kindness', description: '暖象牙色、浅杏色与柔软的圆角层次。', detail: '像一段不被催促的午后，把温柔放在行动之前。', icon: CloudSun },
  { id: 'morandi', name: '莫兰迪', english: 'Muted Morandi', description: '灰绿、灰粉与低饱和的安静色阶。', detail: '收敛色彩情绪，用细腻层次衬托真实生活。', icon: Palette },
];

export default function DesignsPage() {
  const { theme: activeTheme, setTheme } = useApp();
  return (
    <div className="designs-page page-container">
      <header className="designs-header"><p className="eyebrow">同一套产品，五种生活气质</p><h1>选择看起来更像你的<br />Do Something。</h1><p>五套都是完整可切换主题，共用相同的数据、权限和功能。选择会保存在当前浏览器，你可以随时换回来。</p></header>
      <div className="theme-grid">
        {themes.map((theme) => {
          const Icon = theme.icon;
          const active = activeTheme === theme.id;
          return (
            <article className={`theme-option ${active ? 'theme-option-active' : ''}`} key={theme.id}>
              <div className={`theme-preview theme-${theme.id}`} aria-label={`${theme.name}视觉预览`}>
                <div className="preview-top"><span className="preview-brand">Do Something</span><Icon /></div>
                <div className="preview-body"><span className="preview-kicker">给“改天”一个轻轻的结尾</span><h2>今天，<br />轻轻开始。</h2><p>一件真正想做的事，一个只属于自己的约定。</p><span className="preview-button">选一件想做的事<ArrowRight /></span></div>
                <div className="preview-path" aria-hidden="true"><i /><i /><b /></div>
              </div>
              <div className="theme-option-copy"><div><span className="eyebrow">{theme.english}</span><h2>{theme.name}</h2></div>{active && <span className="badge"><Check />正在使用</span>}</div>
              <p>{theme.description}</p><p className="theme-detail">{theme.detail}</p>
              <Button variant={active ? 'secondary' : 'outline'} disabled={active} onClick={() => setTheme(theme.id)}>{active ? '当前主题' : `应用${theme.name}`}</Button>
            </article>
          );
        })}
      </div>
      <section className="designs-note"><h2>改变的是视觉，不是你的记录。</h2><p>主题只影响字体、颜色、间距与图形语言。完成声明、分享许可和凭证状态不会因切换而改变。</p><Link to="/" className="primary-link">回到主题列表<ArrowRight /></Link></section>
    </div>
  );
}
