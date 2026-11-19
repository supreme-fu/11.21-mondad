import { Route, Routes } from 'react-router';
import { Layout } from '@/components/Layout';
import Home from '@/pages/Home';
import ActivityPage from '@/pages/ActivityPage';
import CompletionPage from '@/pages/CompletionPage';
import RecordsPage from '@/pages/RecordsPage';
import AboutPage from '@/pages/AboutPage';
import DesignsPage from '@/pages/DesignsPage';
import BadgesPage from '@/pages/BadgesPage';
import NotFoundPage from '@/pages/NotFoundPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/activities/:id" element={<ActivityPage />} />
        <Route path="/complete/:participationId" element={<CompletionPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/designs" element={<DesignsPage />} />
        <Route path="/badges" element={<BadgesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
