import { NavLink, Route, Routes } from 'react-router-dom';
import { useBranding } from './lib/branding';
import QueuePage from './pages/QueuePage';
import PatientsPage from './pages/PatientsPage';
import AddonsPage from './pages/AddonsPage';
import BrandingPage from './pages/BrandingPage';
import VisitTemplatesPage from './pages/VisitTemplatesPage';
import AnalyticsPage from './pages/AnalyticsPage';

export default function App() {
  const branding = useBranding();

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">
          {branding.logoUrl ? <img src={branding.logoUrl} alt="" style={{ height: 24, marginRight: 8 }} /> : null}
          {branding.productName}
        </div>
        <NavLink to="/" end>Today's Queue</NavLink>
        <NavLink to="/patients">Patients</NavLink>
        <NavLink to="/visit-templates">Visit Templates</NavLink>
        <NavLink to="/analytics">Analytics</NavLink>
        <NavLink to="/addons">Add-ons</NavLink>
        <NavLink to="/branding">Branding</NavLink>
        {(branding.footerText || !branding.hidePoweredBy) && (
          <div className="muted" style={{ marginTop: 32, opacity: 0.7, fontSize: 11, lineHeight: 1.5 }}>
            {branding.footerText && <div>{branding.footerText}</div>}
            {!branding.hidePoweredBy && <div style={{ opacity: 0.6 }}>Powered by Aetos One</div>}
          </div>
        )}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<QueuePage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/visit-templates" element={<VisitTemplatesPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/addons" element={<AddonsPage />} />
          <Route path="/branding" element={<BrandingPage />} />
        </Routes>
      </main>
    </div>
  );
}
