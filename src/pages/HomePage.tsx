import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROLE_LABELS } from '../services/authService';
import {
  fetchDashboardData,
  type DashboardActivity,
  type DashboardData,
  type DashboardPeriod,
} from '../services/dashboardService';
import {
  fetchCoordinatorPendingJustificationCount,
  fetchHomeRecentActivities,
} from '../services/homeOverviewService';
import type { UserRole } from '../types/database';
import { DashboardCharts } from './dashboard/DashboardCharts';
import './dashboard/DashboardPage.css';
import './HomePage.css';

interface HomeOverview {
  userId: string;
  role: UserRole;
  dashboard: DashboardData;
  activities: DashboardActivity[];
  coordinatorPendingJustificationCount: number | null;
}

interface QuickAccess {
  label: string;
  description: string;
  href: string;
}

interface MetricCard {
  label: string;
  value: number;
}

function getCurrentMonthPeriod(date: Date): DashboardPeriod {
  const dateValue = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    startDate: dateValue(new Date(date.getFullYear(), date.getMonth(), 1)),
    endDate: dateValue(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

function formatPeriod(period: DashboardPeriod): string {
  return new Date(`${period.startDate}T12:00:00`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
}

function formatActivityDate(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRoleScope(role: UserRole): string {
  if (role === 'SECRETARIA') return 'Visão geral dos cursos disponíveis para a Secretaria.';
  if (role === 'COORDENADOR') return 'Dados dos cursos sob sua responsabilidade, conforme o escopo aplicado pelo Supabase.';
  return 'Indicadores e atividades dos seus próprios registros.';
}

function getQuickAccess(role: UserRole): QuickAccess[] {
  if (role === 'SECRETARIA') {
    return [
      { label: 'Professores e usuários', description: 'Consulte e gerencie os usuários cadastrados.', href: '/secretaria/usuarios' },
      { label: 'Ausências', description: 'Acompanhe os registros de ausência.', href: '/secretaria/ausencias' },
      { label: 'Justificativas', description: 'Consulte as justificativas encaminhadas.', href: '/secretaria/justificativas' },
      { label: 'Reposições', description: 'Acompanhe as reposições de aula.', href: '/secretaria/reposicoes' },
      { label: 'Atestados', description: 'Confira os documentos recebidos.', href: '/secretaria/atestados' },
      { label: 'Gestão acadêmica', description: 'Acesse cursos, turmas e períodos letivos.', href: '/secretaria/gestao-academica' },
    ];
  }
  if (role === 'COORDENADOR') {
    return [
      { label: 'Ausências', description: 'Acompanhe as ausências dos cursos sob sua responsabilidade.', href: '/coordenacao/ausencias' },
      { label: 'Justificativas', description: 'Analise as justificativas encaminhadas para sua decisão.', href: '/coordenacao/justificativas' },
      { label: 'Reposições', description: 'Acompanhe as reposições vinculadas aos seus cursos.', href: '/coordenacao/reposicoes' },
    ];
  }
  return [
    { label: 'Registrar ausência', description: 'Registre uma ausência em uma de suas aulas.', href: '/professor/ausencias/nova' },
    { label: 'Minhas ausências', description: 'Consulte os seus registros de ausência.', href: '/professor/ausencias' },
    { label: 'Minhas justificativas', description: 'Acompanhe o andamento das suas justificativas.', href: '/professor/justificativas' },
    { label: 'Minhas reposições', description: 'Consulte as reposições vinculadas às suas ausências.', href: '/professor/reposicoes' },
  ];
}

function getMetrics(overview: HomeOverview): MetricCard[] {
  const { indicators } = overview.dashboard;
  if (overview.role === 'SECRETARIA') {
    return [
      { label: 'Ausências no período', value: indicators.absences },
      { label: 'Substituições confirmadas', value: indicators.substitutions },
      { label: 'Reposições pendentes', value: indicators.pendingMakeups },
      { label: 'Justificativas pendentes', value: indicators.justificationsAwaitingDecision },
      { label: 'Atestados pendentes', value: indicators.pendingDocuments },
    ];
  }
  if (overview.role === 'COORDENADOR') {
    const metrics: MetricCard[] = [
      { label: 'Ausências no período', value: indicators.absences },
      { label: 'Substituições confirmadas', value: indicators.substitutions },
      { label: 'Aulas vagas', value: indicators.vacantClasses },
      { label: 'Aulas dispensadas', value: indicators.dispensedClasses },
      { label: 'Reposições pendentes', value: indicators.pendingMakeups },
    ];
    if (overview.coordinatorPendingJustificationCount !== null) {
      metrics.push({
        label: 'Justificativas aguardando sua decisão',
        value: overview.coordinatorPendingJustificationCount,
      });
    }
    return metrics;
  }
  return [
    { label: 'Minhas ausências', value: indicators.absences },
    { label: 'Substituições confirmadas', value: indicators.substitutions },
    { label: 'Reposições pendentes', value: indicators.pendingMakeups },
    { label: 'Minhas justificativas pendentes', value: indicators.justificationsAwaitingDecision },
    { label: 'Meus atestados pendentes', value: indicators.pendingDocuments },
  ];
}

function getPendingActions(overview: HomeOverview): DashboardData['pendingActions'] {
  if (overview.role !== 'COORDENADOR') return overview.dashboard.pendingActions;

  const actions = overview.dashboard.pendingActions.filter(({ id }) => id !== 'justifications');
  const count = overview.coordinatorPendingJustificationCount;
  if (count !== null && count > 0) {
    actions.unshift({
      id: 'justifications',
      label: 'Justificativas aguardando sua decisão',
      count,
      href: '/coordenacao/justificativas',
    });
  }
  return actions;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível carregar a página inicial.';
}

export function HomePage() {
  const { isLoading: isAuthLoading, profile } = useAuth();
  const period = useMemo(() => getCurrentMonthPeriod(new Date()), []);
  const [overview, setOverview] = useState<HomeOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    if (!profile) {
      setOverview(null);
      setIsLoading(false);
      setErrorMessage(null);
      return () => { active = false; };
    }

    setIsLoading(true);
    setErrorMessage(null);
    const coordinatorCount = profile.role === 'COORDENADOR'
      ? fetchCoordinatorPendingJustificationCount(profile.id)
      : Promise.resolve(null);

    void Promise.all([
      fetchDashboardData(profile.role, profile.id, period),
      fetchHomeRecentActivities(profile.role, profile.id, period),
      coordinatorCount,
    ]).then(([dashboard, activities, coordinatorPendingJustificationCount]) => {
      if (active) {
        setOverview({
          userId: profile.id,
          role: profile.role,
          dashboard,
          activities,
          coordinatorPendingJustificationCount,
        });
      }
    }).catch((error: unknown) => {
      if (active) {
        setOverview(null);
        setErrorMessage(getErrorMessage(error));
      }
    }).finally(() => {
      if (active) setIsLoading(false);
    });

    return () => { active = false; };
  }, [profile, period, retry]);

  const currentOverview = overview && overview.userId === profile?.id && overview.role === profile?.role
    ? overview
    : null;

  if (isAuthLoading) {
    return <div className="state-box" role="status"><span className="spinner" aria-hidden="true" /><p>Verificando seu acesso...</p></div>;
  }

  if (!profile) {
    return (
      <div className="page-stack home-page">
        <section className="hero-card home-welcome">
          <span className="badge-stage">Conecta Acadêmico Impacta</span>
          <h1>Bem-vindo(a)</h1>
          <p className="lead-text">Acesse os recursos acadêmicos conforme seu perfil institucional.</p>
          <div className="hero-actions"><Link className="btn-primary" to="/login">Entrar no sistema</Link></div>
        </section>
      </div>
    );
  }

  if (isLoading && !currentOverview) {
    return <div className="state-box" role="status"><span className="spinner" aria-hidden="true" /><p>Carregando sua visão geral...</p></div>;
  }

  const quickAccess = getQuickAccess(profile.role);
  const pendingActions = currentOverview ? getPendingActions(currentOverview) : [];

  return (
    <div className="page-stack home-page">
      <section className="hero-card home-welcome">
        <span className="badge-stage">Início</span>
        <h1>Olá, {profile.full_name}</h1>
        <p className="lead-text">{ROLE_LABELS[profile.role]} · {getRoleScope(profile.role)}</p>
        {currentOverview && <p className="home-period">Visão do período: {formatPeriod(period)}</p>}
      </section>

      {errorMessage && (
        <div className="alert-box alert-danger home-error" role="alert">
          <span>{errorMessage}</span>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRetry((current) => current + 1)}>Tentar novamente</button>
        </div>
      )}

      {currentOverview && <>
        <section className="info-card" aria-labelledby="home-indicators-heading">
          <div className="section-header-row">
            <div>
              <h2 id="home-indicators-heading">Indicadores do período</h2>
              <p className="text-muted">Resumo atualizado com os dados disponíveis para seu perfil.</p>
            </div>
            <Link className="text-link" to="/painel">Abrir dashboard</Link>
          </div>
          <div className="home-metric-grid">
            {getMetrics(currentOverview).map(({ label, value }) => (
              <article className="summary-card home-metric-card" key={label}>
                <span className="summary-label">{label}</span>
                <strong className="summary-value">{value}</strong>
              </article>
            ))}
          </div>
          <DashboardCharts
            data={currentOverview.dashboard.charts}
            indicators={currentOverview.dashboard.indicators}
            showCourseComparison={profile.role !== 'PROFESSOR'}
          />
        </section>

        <div className="home-content-grid">
          <section className="info-card" aria-labelledby="home-pending-heading">
            <h2 id="home-pending-heading">Pendências</h2>
            {pendingActions.length > 0 ? (
              <ul className="home-pending-list">
                {pendingActions.map((action) => (
                  <li key={action.id}>
                    <Link to={action.href}>
                      <span>{action.label}</span>
                      <strong>{action.count}</strong>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted">Não há pendências para exibir neste período.</p>}
          </section>

          <section className="info-card" aria-labelledby="home-quick-access-heading">
            <h2 id="home-quick-access-heading">Acessos rápidos</h2>
            <div className="home-quick-access-list">
              {quickAccess.map((item) => (
                <Link className="home-quick-access" to={item.href} key={item.href}>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <section className="info-card" aria-labelledby="home-activities-heading">
          <h2 id="home-activities-heading">Atividades recentes</h2>
          {currentOverview.activities.length > 0 ? (
            <ol className="home-activity-list">
              {currentOverview.activities.map((activity) => (
                <li key={activity.id}>
                  <Link to={activity.href}>
                    <span>{activity.label}</span>
                    <time dateTime={activity.occurredAt}>{formatActivityDate(activity.occurredAt)}</time>
                  </Link>
                </li>
              ))}
            </ol>
          ) : <p className="text-muted">Não há atividades recentes no período selecionado.</p>}
        </section>
      </>}
    </div>
  );
}
