import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../services/authService';
import {
  fetchDashboardAcademicTerms,
  fetchDashboardData,
  type AcademicTermPeriod,
  type DashboardData,
  type DashboardIndicators,
  type DashboardPeriod,
} from '../../services/dashboardService';
import { DashboardCharts } from './DashboardCharts';
import './DashboardPage.css';

type PeriodPreset = 'TODAY' | 'WEEK' | 'MONTH' | 'SEMESTER' | 'CUSTOM';

interface DashboardCard {
  key: keyof DashboardIndicators;
  label: string;
}

const dateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function getCurrentSemester(terms: AcademicTermPeriod[], today: string) {
  return terms.find((term) => term.active && term.start_date <= today && term.end_date >= today) ?? null;
}

function periodLabel(period: DashboardPeriod) {
  const format = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
  return `${format(period.startDate)} a ${format(period.endDate)}`;
}

function getPresetPeriod(preset: PeriodPreset, today: Date, semester: AcademicTermPeriod | null): DashboardPeriod | null {
  const todayValue = dateInputValue(today);
  if (preset === 'TODAY') return { startDate: todayValue, endDate: todayValue };
  if (preset === 'WEEK') {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
  }
  if (preset === 'MONTH') {
    return {
      startDate: dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
      endDate: dateInputValue(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    };
  }
  if (preset === 'SEMESTER' && semester) {
    return { startDate: semester.start_date, endDate: semester.end_date };
  }
  return null;
}

export function DashboardPage() {
  const { profile } = useAuth();
  const [preset, setPreset] = useState<PeriodPreset>('MONTH');
  const today = useMemo(() => new Date(), []);
  const [customStart, setCustomStart] = useState(dateInputValue(today));
  const [customEnd, setCustomEnd] = useState(dateInputValue(today));
  const [terms, setTerms] = useState<AcademicTermPeriod[]>([]);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const indicators = dashboardData?.indicators ?? null;
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    void fetchDashboardAcademicTerms().then((rows) => {
      if (active) setTerms(rows);
    }).catch((error: unknown) => {
      if (active) setTermsError(error instanceof Error ? error.message : 'Não foi possível consultar os semestres.');
    });
    return () => { active = false; };
  }, []);

  const todayValue = dateInputValue(today);
  const semester = getCurrentSemester(terms, todayValue);
  const period = useMemo(() => {
    if (preset === 'CUSTOM') return customStart && customEnd ? { startDate: customStart, endDate: customEnd } : null;
    return getPresetPeriod(preset, today, semester);
  }, [preset, customStart, customEnd, today, semester]);

  useEffect(() => {
    let active = true;
    if (!profile || !period || period.startDate > period.endDate) {
      setDashboardData(null);
      setIsLoading(false);
      setErrorMessage(period && period.startDate > period.endDate ? 'A data inicial deve ser anterior ou igual à data final.' : null);
      return () => { active = false; };
    }
    setIsLoading(true);
    setErrorMessage(null);
    void fetchDashboardData(profile.role, profile.id, period).then((result) => {
      if (active) {
        setDashboardData(result);
        setGeneratedAt(new Date());
      }
    }).catch((error: unknown) => {
      if (active) {
        setDashboardData(null);
        setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar os indicadores.');
      }
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [profile, period]);

  const cards = useMemo<DashboardCard[]>(() => {
    const common: DashboardCard[] = [
      { key: 'absences', label: 'Ausências' },
      { key: 'substitutions', label: 'Substituições confirmadas' },
      { key: 'vacantClasses', label: 'Aulas vagas' },
      { key: 'dispensedClasses', label: 'Aulas dispensadas' },
      { key: 'pendingMakeups', label: 'Reposições pendentes' },
      { key: 'completedMakeups', label: 'Reposições realizadas' },
      { key: 'justificationsAwaitingDecision', label: 'Justificativas aguardando decisão' },
    ];
    if (profile?.role === 'COORDENADOR') return common.filter(({ key }) => key !== 'justificationsAwaitingDecision');
    if (profile?.role === 'SECRETARIA') {
      return [...common, { key: 'pendingDocuments', label: 'Atestados pendentes de conferência' }];
    }
    return [
      ...common.map((card) => card.key === 'justificationsAwaitingDecision'
        ? { ...card, label: 'Justificativas próprias pendentes' }
        : card),
      { key: 'pendingDocuments', label: 'Atestados próprios pendentes de conferência' },
    ];
  }, [profile?.role]);

  const scopeLabel = profile?.role === 'SECRETARIA'
    ? 'Todos os cursos — Secretaria'
    : profile?.role === 'COORDENADOR'
      ? 'Cursos sob sua responsabilidade — escopo aplicado pelo Supabase RLS'
      : 'Registros próprios — Professor';

  const handlePrint = () => window.print();

  return (
    <section className="info-card dashboard-page">
      <div className="dashboard-controls">
        <span className="badge-stage">Indicadores e relatórios</span>
        <h2>Dashboard</h2>
        <p className="lead-text">Acompanhe os registros disponíveis para seu perfil e período.</p>
        <div className="dashboard-filter-row">
          <label className="form-group" htmlFor="dashboard-period">
            <span className="form-label">Período</span>
            <select id="dashboard-period" className="form-input" value={preset} onChange={(event) => setPreset(event.target.value as PeriodPreset)}>
              <option value="TODAY">Hoje</option>
              <option value="WEEK">Esta semana</option>
              <option value="MONTH">Este mês</option>
              <option value="SEMESTER">Este semestre</option>
              <option value="CUSTOM">Período personalizado</option>
            </select>
          </label>
          {preset === 'CUSTOM' && <>
            <label className="form-group" htmlFor="dashboard-start"><span className="form-label">Data inicial</span><input id="dashboard-start" className="form-input" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
            <label className="form-group" htmlFor="dashboard-end"><span className="form-label">Data final</span><input id="dashboard-end" className="form-input" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
          </>}
          <button className="btn-secondary" type="button" onClick={handlePrint} disabled={!indicators || isLoading}>Exportar PDF</button>
        </div>
        {preset === 'SEMESTER' && <p className="text-muted">{semester ? `${semester.name}: ${periodLabel({ startDate: semester.start_date, endDate: semester.end_date })}` : termsError ?? 'Não há semestre letivo ativo que inclua a data de hoje.'}</p>}
        {period && period.startDate <= period.endDate && <p className="text-muted">Período: {periodLabel(period)}</p>}
      </div>

      {errorMessage && <div className="alert-box alert-danger" role="alert">{errorMessage}</div>}
      {isLoading ? <div className="state-box" role="status"><span className="spinner" aria-hidden="true" /><p>Carregando indicadores...</p></div>
        : indicators && period ? <section id="dashboard-report" className="dashboard-report" aria-label="Relatório de indicadores">
          <header className="dashboard-report-header">
            <p className="dashboard-institution">Faculdade Impacta de Tecnologia</p>
            <h1>Conecta Acadêmico Impacta</h1>
            <h2>Relatório de indicadores</h2>
            <p><strong>Perfil:</strong> {profile ? ROLE_LABELS[profile.role] : ''}</p>
            <p><strong>Escopo:</strong> {scopeLabel}</p>
            <p><strong>Período:</strong> {periodLabel(period)}</p>
            <p><strong>Gerado em:</strong> {generatedAt?.toLocaleString('pt-BR') ?? '—'}</p>
          </header>
          <div className="dashboard-cards">
            {cards.map(({ key, label }) => <article className="dashboard-metric" key={key}>
              <span>{label}</span>
              <strong>{indicators[key]}</strong>
            </article>)}
          </div>
          {cards.every(({ key }) => indicators[key] === 0) && <p className="text-muted dashboard-empty">Não há registros para o período selecionado.</p>}
          {dashboardData && <DashboardCharts data={dashboardData.charts} indicators={indicators} />}
        </section>
          : !errorMessage && preset === 'SEMESTER' && !semester ? <div className="state-box"><p className="text-muted">Este filtro depende de um semestre letivo ativo que inclua a data de hoje.</p></div>
            : null}
    </section>
  );
}
