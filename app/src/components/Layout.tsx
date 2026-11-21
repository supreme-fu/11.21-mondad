import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Award, Check, ChevronDown, Coins, Compass, Globe2, Leaf, LoaderCircle, ScrollText } from 'lucide-react';
import { Toaster } from 'sonner';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useApp } from '@/context/AppContext';

function AccountGate() {
  const { selectAccount } = useApp();
  const [pending, setPending] = useState<'a' | 'b' | null>(null);
  const [error, setError] = useState('');
  async function choose(account: 'a' | 'b') {
    setPending(account);
    setError('');
    try { await selectAccount(account); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '暂时无法进入演示账户。'); }
    finally { setPending(null); }
  }
  return (
    <main className="account-gate">
      <Logo />
      <div className="account-gate-copy">
        <span className="soft-icon"><Leaf /></span>
        <h1>选择身份开始</h1>
        <p>选择演示账号立即进入。</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="account-choices">
          <Button onClick={() => void choose('a')} disabled={pending !== null}>
            {pending === 'a' ? <LoaderCircle className="animate-spin" /> : '以阿黎的身份继续'}
          </Button>
          <Button variant="outline" onClick={() => void choose('b')} disabled={pending !== null}>
            {pending === 'b' ? <LoaderCircle className="animate-spin" /> : '以小舟的身份继续'}
          </Button>
        </div>
      </div>
    </main>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, loading, error, selectAccount } = useApp();
  if (loading) {
    return <main className="app-loading"><Logo /><p><LoaderCircle className="animate-spin" />正在整理你的生活清单…</p></main>;
  }
  if (!user) return <AccountGate />;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="site-header">
        <Logo />
        <nav className="main-nav" aria-label="主要导航">
          <NavLink to="/" end>发现主题</NavLink>
          <NavLink to="/records">我的记录</NavLink>
          <NavLink to="/badges">徽章图鉴</NavLink>
          <a href="/intro.html">官网介绍</a>
        </nav>
        <div className="header-right-tools">
          <Link to="/records" className="header-points-pill" aria-label="查看余额与充值" data-testid="header-points-pill">
            <Coins size={14} aria-hidden="true" />
            <span>{user.points ?? 100} 点</span>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="account-trigger" aria-label="切换演示账户">
                <span className="account-avatar">{user.displayName.slice(0, 1)}</span>
                <span className="account-name">{user.displayName}</span>
                <ChevronDown aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="account-menu">
              <DropdownMenuLabel>切换演示账户</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(['a', 'b'] as const).map((account) => (
                <DropdownMenuItem key={account} onSelect={() => void selectAccount(account)}>
                  <span>{account === 'a' ? '阿黎' : '小舟'}</span>
                  {user.demoKey === account && <Check aria-hidden="true" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><a href="/intro.html">官网介绍</a></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/records#account">账户设置</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {error && <div className="global-error" role="alert">{error}</div>}
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <Logo />
        <div>
          <Link to="/">发现主题</Link>
          <Link to="/records">我的记录</Link>
          <Link to="/badges">徽章图鉴</Link>
          <a href="/intro.html">官网介绍</a>
        </div>
      </footer>
      <nav className="mobile-tabbar" aria-label="移动端底部导航" data-testid="mobile-tabbar">
        <NavLink to="/" end className={({ isActive }) => `mobile-tab-item ${isActive ? 'is-active' : ''}`}>
          <Compass size={20} aria-hidden="true" />
          <span>发现</span>
        </NavLink>
        <NavLink to="/records" className={({ isActive }) => `mobile-tab-item ${isActive ? 'is-active' : ''}`}>
          <ScrollText size={20} aria-hidden="true" />
          <span>记录</span>
        </NavLink>
        <NavLink to="/badges" className={({ isActive }) => `mobile-tab-item ${isActive ? 'is-active' : ''}`}>
          <Award size={20} aria-hidden="true" />
          <span>徽章</span>
        </NavLink>
        <a href="/intro.html" className="mobile-tab-item">
          <Globe2 size={20} aria-hidden="true" />
          <span>官网</span>
        </a>
      </nav>
      <Toaster position="bottom-center" toastOptions={{ duration: 2600 }} />
    </div>
  );
}
