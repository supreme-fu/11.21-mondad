import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

export default function NotFoundPage() {
  return <div className="empty-state page-container not-found"><span className="eyebrow">这条路暂时没有风景</span><h1>没有找到这个页面</h1><p>地址可能写错了，也可能这条记录已经不再可见。</p><Link className="primary-link" to="/"><ArrowLeft />回到主题列表</Link></div>;
}
