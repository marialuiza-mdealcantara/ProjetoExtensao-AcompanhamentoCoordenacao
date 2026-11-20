import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../services/authService';
import type { UserRole } from '../../types/database';

type SidebarIconName = 'home' | 'teachers' | 'absence' | 'justifications' | 'makeups' | 'dashboard' | 'admin' | 'menu' | 'logout' | 'login';

interface NavigationItem {
  label: string;
  to: string;
  icon: SidebarIconName;
  activePaths?: string[];
}

const roleNavigation: Record<UserRole, NavigationItem[]> = {
  SECRETARIA: [
    { label: 'Professores', to: '/secretaria', icon: 'teachers', activePaths: ['/secretaria/usuarios'] },
    { label: 'Ausências', to: '/secretaria/ausencias', icon: 'absence' },
    { label: 'Justificativas', to: '/secretaria/justificativas', icon: 'justifications' },
    { label: 'Reposições', to: '/secretaria/reposicoes', icon: 'makeups' },
    { label: 'Dashboard', to: '/painel', icon: 'dashboard' },
  ],
  COORDENADOR: [
    { label: 'Ausências', to: '/coordenacao', icon: 'absence', activePaths: ['/coordenacao/ausencias'] },
    { label: 'Justificativas', to: '/coordenacao/justificativas', icon: 'justifications' },
    { label: 'Reposições', to: '/coordenacao/reposicoes', icon: 'makeups' },
    { label: 'Dashboard', to: '/painel', icon: 'dashboard' },
  ],
  PROFESSOR: [
    { label: 'Ausências', to: '/professor', icon: 'absence', activePaths: ['/professor/ausencias'] },
    { label: 'Justificativas', to: '/professor/justificativas', icon: 'justifications' },
    { label: 'Reposições', to: '/professor/reposicoes', icon: 'makeups' },
    { label: 'Dashboard', to: '/painel', icon: 'dashboard' },
  ],
};

function GraduationCapIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M3.5 15.5 24 6l20.5 9.5L24 25 3.5 15.5Z" fill="currentColor" />
      <path d="M11 20v11.2c7.5 6.1 18.5 6.1 26 0V20l-13 6-13-6Z" fill="currentColor" opacity=".78" />
      <path d="M44.5 16v12m0 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<SidebarIconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    teachers: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1H3Z" /><path d="M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.6V20h-3" /></>,
    absence: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-13 4h3m-3 3h7" /></>,
    justifications: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6m-6 4h6" /></>,
    makeups: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 11.9-3" /></>,
    dashboard: <><path d="M3 20h18M5 17V9m5 8V4m5 13v-6m5 6V7" /></>,
    admin: <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
    login: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...common}>{paths[name]}</svg>;
}

function matchesPath(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AppLayout() {
  const { profile, user, isConfigured, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdministrationOpen, setIsAdministrationOpen] = useState(false);
  const role = profile?.role ?? null;
  const navigation = role ? roleNavigation[role] : [];
  const administrationPaths = ['/secretaria/gestao-academica', '/secretaria/atestados'];
  const administrationIsActive = administrationPaths.some((path) => matchesPath(location.pathname, path));

  useEffect(() => {
    setIsMobileMenuOpen(false);
    if (administrationIsActive) setIsAdministrationOpen(true);
  }, [location.pathname, administrationIsActive]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const handleAdministrationToggle = () => {
    if (isCollapsed) setIsCollapsed(false);
    setIsAdministrationOpen((current) => !current);
  };

  return (
    <div className={`app-shell${isCollapsed ? ' sidebar-collapsed' : ''}`}>
      {isMobileMenuOpen && <button className="sidebar-backdrop" type="button" aria-label="Fechar menu" onClick={closeMobileMenu} />}

      <aside className={`app-sidebar${isCollapsed ? ' is-collapsed' : ''}${isMobileMenuOpen ? ' is-open' : ''}`} aria-label="Navegação do Conecta Acadêmico Impacta">
        <div className="sidebar-brand-row">
          <Link to="/" className="sidebar-brand" aria-label="Conecta Acadêmico Impacta — Início" onClick={closeMobileMenu}>
            <span className="sidebar-brand-mark"><GraduationCapIcon /></span>
            <span className="sidebar-brand-copy">
              <strong>Conecta Acadêmico Impacta</strong>
              <small>Faculdade Impacta de Tecnologia</small>
            </span>
          </Link>
          <button className="sidebar-collapse-toggle" type="button" onClick={() => setIsCollapsed((current) => !current)} aria-label={isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'} aria-expanded={!isCollapsed} title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}>
            <span aria-hidden="true">{isCollapsed ? '›' : '‹'}</span>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Menu principal">
          <NavLink to="/" end className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`} onClick={closeMobileMenu} title="Início">
            <SidebarIcon name="home" /><span>Início</span>
          </NavLink>

          {user && profile?.active && role ? <>
            {navigation.map((item) => <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/secretaria' || item.to === '/coordenacao' || item.to === '/professor'}
              className={({ isActive }) => {
                const isRoleHome = item.activePaths?.some((path) => matchesPath(location.pathname, path));
                return `sidebar-link${isActive || isRoleHome ? ' is-active' : ''}`;
              }}
              onClick={closeMobileMenu}
              title={item.label}
            >
              <SidebarIcon name={item.icon} /><span>{item.label}</span>
            </NavLink>)}

            {role === 'SECRETARIA' && <div className={`sidebar-nav-group${administrationIsActive ? ' is-active' : ''}`}>
              <button className={`sidebar-link sidebar-group-toggle${administrationIsActive ? ' is-active' : ''}`} type="button" onClick={handleAdministrationToggle} aria-expanded={isAdministrationOpen} title="Administração">
                <SidebarIcon name="admin" /><span>Administração</span><span className="sidebar-chevron" aria-hidden="true">{isAdministrationOpen ? '−' : '+'}</span>
              </button>
              {isAdministrationOpen && <div className="sidebar-subnav">
                <NavLink to="/secretaria/gestao-academica" className={({ isActive }) => `sidebar-link sidebar-sublink${isActive ? ' is-active' : ''}`} onClick={closeMobileMenu} title="Gestão Acadêmica">Gestão Acadêmica</NavLink>
                <NavLink to="/secretaria/atestados" className={({ isActive }) => `sidebar-link sidebar-sublink${isActive ? ' is-active' : ''}`} onClick={closeMobileMenu} title="Atestados">Atestados</NavLink>
              </div>}
            </div>}
          </> : <>
            <NavLink to="/login" className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`} onClick={closeMobileMenu} title="Entrar">
              <SidebarIcon name="login" /><span>Entrar</span>
            </NavLink>
            <NavLink to="/recuperar-senha" className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`} onClick={closeMobileMenu} title="Recuperar senha">
              <SidebarIcon name="justifications" /><span>Recuperar senha</span>
            </NavLink>
          </>}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-connection" title={isConfigured ? 'Supabase conectado' : 'Aguardando configuração do Supabase'}>
            <span className={`connection-dot${isConfigured ? ' is-connected' : ''}`} aria-hidden="true" />
            <span>{isConfigured ? 'Supabase conectado' : 'Aguardando .env'}</span>
          </div>
          {user && profile && <div className="sidebar-user">
            <span className="sidebar-user-avatar" aria-hidden="true">{profile.full_name.trim().slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
            <span className="sidebar-user-copy"><strong title={profile.full_name}>{profile.full_name}</strong><small>{ROLE_LABELS[profile.role]}</small></span>
          </div>}
          {user && <button type="button" className="sidebar-logout" onClick={() => void handleSignOut()} title="Sair da conta">
            <SidebarIcon name="logout" /><span>Sair</span>
          </button>}
        </div>
      </aside>

      <div className="app-content">
        <header className="mobile-topbar">
          <button className="mobile-menu-toggle" type="button" onClick={() => setIsMobileMenuOpen(true)} aria-label="Abrir menu de navegação" aria-expanded={isMobileMenuOpen}>
            <SidebarIcon name="menu" />
          </button>
          <Link to="/" className="mobile-brand" aria-label="Conecta Acadêmico Impacta — Início">
            <span className="mobile-brand-mark"><GraduationCapIcon /></span>
            <strong>Conecta Acadêmico Impacta</strong>
          </Link>
        </header>
        <main className="app-main container">
          <Outlet />
        </main>
        <footer className="app-footer">
          <div className="container footer-content">
            <span>Conecta Acadêmico Impacta</span>
            <span>Faculdade Impacta de Tecnologia</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
