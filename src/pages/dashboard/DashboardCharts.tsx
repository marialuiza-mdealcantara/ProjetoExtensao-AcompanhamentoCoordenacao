import type { DashboardIndicators } from '../../services/dashboardService';
import type { DashboardChartsData } from '../../services/dashboardAggregation';

const colors = {
  navy: '#002F6C',
  darkGray: '#63666A',
  lightGray: '#97999B',
  black: '#171717',
  lightBlue: '#4A90D9',
  green: '#2E8B57',
  orange: '#D97706',
  purple: '#7E57C2',
  yellow: '#E0B323',
  red: '#C43D3D',
};

const courseColors = [colors.navy, colors.lightBlue, colors.green, colors.orange, colors.purple, colors.yellow, colors.darkGray];

function EmptyChart({ message }: { message: string }) {
  return <p className="dashboard-chart-empty">{message}</p>;
}

function AbsenceTimeline({ points }: { points: DashboardChartsData['absenceTimeline'] }) {
  if (points.length === 0 || points.every(({ count }) => count === 0)) {
    return <EmptyChart message="Não há ausências no período selecionado." />;
  }
  const width = 760;
  const height = 270;
  const left = 52;
  const right = 34;
  const top = 24;
  const bottom = 54;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  const max = Math.max(1, ...points.map(({ count }) => count));
  const tickCount = Math.min(4, max);
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? left + graphWidth / 2 : left + index * graphWidth / (points.length - 1),
    y: top + graphHeight - point.count * graphHeight / max,
    ...point,
  }));
  const labelInterval = Math.max(1, Math.ceil(points.length / 8));
  return <div className="dashboard-chart-scroll"><svg className="dashboard-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolução de ausências no período">
    {Array.from({ length: tickCount + 1 }, (_, step) => {
      const y = top + graphHeight - step * graphHeight / tickCount;
      const value = Math.round(max * step / tickCount);
      return <g key={step}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#D8DEE8" strokeDasharray="4 4" /><text x={left - 10} y={y + 4} textAnchor="end" className="dashboard-axis-label">{value}</text></g>;
    })}
    <polyline points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke={colors.navy} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    {coordinates.map((point, index) => <g key={point.date}>
      <circle cx={point.x} cy={point.y} r="5" fill={colors.lightBlue} stroke={colors.navy} strokeWidth="2"><title>{`${point.label}: ${point.count} ausência(s)`}</title></circle>
      {(index % labelInterval === 0 || index === coordinates.length - 1) && <text x={point.x} y={height - 20} textAnchor={coordinates.length === 1 || (index > 0 && index < coordinates.length - 1) ? 'middle' : index === 0 ? 'start' : 'end'} className="dashboard-axis-label">{point.label}</text>}
    </g>)}
  </svg></div>;
}

function CourseAbsences({ rows }: { rows: DashboardChartsData['absencesByCourse'] }) {
  if (rows.length === 0) return <EmptyChart message="Não há ausências associadas a cursos no período." />;
  const width = 760;
  const rowHeights = rows.map(({ course }) => Math.max(42, splitCourseName(course).length * 16 + 20));
  const height = Math.max(130, rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) + 12);
  const labelX = 12;
  const barX = 326;
  const barWidth = 390;
  const max = Math.max(1, ...rows.map(({ count }) => count));
  return <div className="dashboard-chart-scroll"><svg className="dashboard-chart-svg dashboard-course-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ausências por curso">
    {rows.map(({ course, count }, index) => {
      const rowTop = 6 + rowHeights.slice(0, index).reduce((sum, rowHeight) => sum + rowHeight, 0);
      const rowHeight = rowHeights[index];
      const lines = splitCourseName(course);
      const labelTop = rowTop + (rowHeight - lines.length * 14) / 2 + 11;
      const barY = rowTop + (rowHeight - 22) / 2;
      const currentBarWidth = count / max * barWidth;
      const color = courseColors[index % courseColors.length];
      return <g key={course}>
        <text x={labelX} y={labelTop} className="dashboard-course-label">{lines.map((line, lineIndex) => <tspan key={`${course}-${lineIndex}`} x={labelX} dy={lineIndex === 0 ? 0 : 14}>{line}</tspan>)}<title>{course}</title></text>
        <rect x={barX} y={barY} width={barWidth} height="22" rx="4" fill="#E9EDF3" />
        <rect x={barX} y={barY} width={Math.max(count > 0 ? 3 : 0, currentBarWidth)} height="22" rx="4" fill={color}><title>{`${course}: ${count} ausência(s)`}</title></rect>
        <text x={barX + barWidth + 12} y={barY + 16} className="dashboard-value-label">{count}</text>
      </g>;
    })}
  </svg></div>;
}

function splitCourseName(name: string, maxChars = 40): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) { lines.push(current); current = ''; }
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      continue;
    }
    if (current && `${current} ${word}`.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

interface StatusSlice { label: string; value: number; color: string }

function StatusDonut({ title, slices }: { title: string; slices: StatusSlice[] }) {
  const total = slices.reduce((sum, { value }) => sum + value, 0);
  if (total === 0) return <EmptyChart message="Não há aulas classificadas no período." />;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return <div className="dashboard-donut-layout">
    <svg className="dashboard-donut-svg" viewBox="0 0 190 190" role="img" aria-label={title}>
      <circle cx="95" cy="95" r={radius} fill="none" stroke="#E9EDF3" strokeWidth="24" />
      {slices.filter(({ value }) => value > 0).map(({ label, value, color }) => {
        const segment = value / total * circumference;
        const currentOffset = offset;
        offset += segment;
        return <circle key={label} cx="95" cy="95" r={radius} fill="none" stroke={color} strokeWidth="24" strokeDasharray={`${segment} ${circumference - segment}`} strokeDashoffset={-currentOffset} transform="rotate(-90 95 95)"><title>{`${label}: ${value} (${Math.round(value / total * 100)}%)`}</title></circle>;
      })}
      <text x="95" y="91" textAnchor="middle" className="dashboard-donut-total">{total}</text>
      <text x="95" y="111" textAnchor="middle" className="dashboard-axis-label">total</text>
    </svg>
    <ul className="dashboard-chart-legend">{slices.map(({ label, value, color }) => <li key={label}><span className="dashboard-legend-swatch" style={{ backgroundColor: color }} />{label}<strong>{value}</strong></li>)}</ul>
  </div>;
}

function MakeupStatus({ indicators }: { indicators: DashboardIndicators }) {
  const rows: StatusSlice[] = [
    { label: 'Pendentes', value: indicators.pendingMakeups, color: colors.yellow },
    { label: 'Realizadas', value: indicators.completedMakeups, color: colors.green },
  ];
  const max = Math.max(1, ...rows.map(({ value }) => value));
  if (max === 1 && rows.every(({ value }) => value === 0)) {
    return <EmptyChart message="Não há reposições no período." />;
  }
  return <svg className="dashboard-chart-svg dashboard-makeup-svg" viewBox="0 0 600 170" role="img" aria-label="Situação das reposições">
    {rows.map(({ label, value, color }, index) => {
      const y = 32 + index * 62;
      const barWidth = value / max * 390;
      return <g key={label}>
        <text x="8" y={y + 17} className="dashboard-course-label">{label}</text>
        <rect x="124" y={y} width="390" height="24" rx="4" fill="#E9EDF3" />
        <rect x="124" y={y} width={Math.max(value > 0 ? 3 : 0, barWidth)} height="24" rx="4" fill={color}><title>{`${label}: ${value}`}</title></rect>
        <text x="528" y={y + 18} className="dashboard-value-label">{value}</text>
      </g>;
    })}
  </svg>;
}

export function DashboardCharts({ data, indicators, showCourseComparison = true }: { data: DashboardChartsData; indicators: DashboardIndicators; showCourseComparison?: boolean }) {
  const classifications: StatusSlice[] = [
    { label: 'Substituídas', value: indicators.substitutions, color: colors.green },
    { label: 'Vagas', value: indicators.vacantClasses, color: colors.red },
    { label: 'Dispensadas', value: indicators.dispensedClasses, color: colors.lightGray },
  ];
  return <section className="dashboard-analysis" aria-labelledby="dashboard-analysis-title">
    <h2 id="dashboard-analysis-title">Análise gráfica</h2>
    <div className="dashboard-charts-grid">
      <article className="dashboard-chart-card dashboard-chart-wide"><h3>Evolução das ausências</h3><p>Quantidade por dia, semana ou mês, conforme a extensão do período.</p><AbsenceTimeline points={data.absenceTimeline} /></article>
      {showCourseComparison && <article className="dashboard-chart-card dashboard-chart-wide"><h3>Ausências por curso</h3><p>Comparação de cursos visíveis para este perfil. Uma ausência é contabilizada em cada curso atendido pela oferta vinculada.</p><CourseAbsences rows={data.absencesByCourse} /></article>}
      <article className="dashboard-chart-card"><h3>Classificação das aulas</h3><p>Ocorrências classificadas no período.</p><StatusDonut title="Classificação das aulas" slices={classifications} /></article>
      <article className="dashboard-chart-card"><h3>Situação das reposições</h3><p>Reposições vinculadas às ausências do período.</p><MakeupStatus indicators={indicators} /></article>
    </div>
  </section>;
}
