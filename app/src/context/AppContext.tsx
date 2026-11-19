import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { Activity, ReceiptMode, RecordItem, User } from '@/types';

export type ThemeName = 'editorial' | 'night' | 'paper' | 'cream' | 'morandi';

interface AppContextValue {
  user: User | null;
  receiptMode: ReceiptMode;
  activities: Activity[];
  records: RecordItem[];
  loading: boolean;
  error: string | null;
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  selectAccount: (account: 'a' | 'b') => Promise<void>;
  refreshRecords: () => Promise<void>;
  clearUser: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);
const themeNames: ThemeName[] = ['editorial', 'night', 'paper', 'cream', 'morandi'];

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [receiptMode, setReceiptMode] = useState<ReceiptMode>('simulation');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem('do-something-theme') as ThemeName | null;
    return saved && themeNames.includes(saved) ? saved : 'editorial';
  });
  const initialized = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('do-something-theme', theme);
  }, [theme]);

  const refreshRecords = useCallback(async () => {
    const nextRecords = await api.records();
    setRecords(nextRecords);
  }, []);

  const selectAccount = useCallback(async (account: 'a' | 'b') => {
    setError(null);
    const session = await api.loginDemo(account);
    setUser(session.user);
    setReceiptMode(session.receiptMode);
    await refreshRecords();
  }, [refreshRecords]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    async function bootstrap() {
      try {
        let session = await api.session();
        if (!session.user) {
          try {
            session = await api.loginDemo('a');
          } catch {
            setUser(null);
          }
        }
        setUser(session.user);
        setReceiptMode(session.receiptMode);
        const nextActivities = await api.activities();
        setActivities(nextActivities);
        if (session.user) await refreshRecords();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '应用暂时无法启动。');
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
  }, [refreshRecords]);

  return (
    <AppContext.Provider value={{
      user, receiptMode, activities, records, loading, error, theme, setTheme, selectAccount, refreshRecords,
      clearUser: () => { setUser(null); setRecords([]); },
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
