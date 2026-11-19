import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Check, ChevronDown, Leaf, LoaderCircle } from 'lucide-react';
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
        <h1>从哪一个演示身份开始？</h1>
        <p>两个账户的数据由服务端隔离。切换身份不需要密码，也不会建立好友关系。</p>
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
  const { user, receiptMode, loading, error, selectAccount } = useApp();
  if (loading) {
    return <main className="app-loading"><Logo /><p><LoaderCircle className="animate-spin" />正在整理你的生活清单…</p></main>;
  }
  if (!user) return <AccountGate />;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <div className="demo-strip">
        <span>{receiptMode === 'simulation' ? '演示环境 · 当前使用本地模拟凭证（不上链、无资产属性）' : 'Monad 测试网 · 不产生真实资产奖励'}</span>
        <Link to="/about">了解数据边界</Link>
      </div>
      <header className="site-header">
        <Logo />
        <nav className="main-nav" aria-label="主要导航">
          <NavLink to="/" end>发现主题</NavLink>
          <NavLink to="/records">我的记录</NavLink>
          <NavLink to="/badges">徽章预览</NavLink>
          <NavLink to="/about">如何相遇</NavLink>
          <a href="/intro.html">官网介绍</a>
        </nav>
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
            <DropdownMenuItem asChild><Link to="/designs">视觉方案</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/badges">徽章预览</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/records#account">账户与删除</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {error && <div className="global-error" role="alert">{error}</div>}
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <Logo />
        <p>每个人独自行动，但不是孤立地行动。</p>
        <div><a href="/intro.html">项目愿景</a><Link to="/designs">视觉方案</Link><Link to="/about">隐私与凭证</Link><span>首版原型 · 无真实奖励</span></div>
      </footer>
      <Toaster position="bottom-center" toastOptions={{ duration: 2600 }} />
    </div>
  );
}
