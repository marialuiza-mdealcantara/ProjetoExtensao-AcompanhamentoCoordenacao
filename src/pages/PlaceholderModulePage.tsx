import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types/database';

interface PlaceholderModulePageProps {
  title: string;
  description: string;
  allowedRoles: readonly UserRole[];
}

export function PlaceholderModulePage({
  title,
  description,
  allowedRoles,
}: PlaceholderModulePageProps) {
  const { profile } = useAuth();

  return (
    <section className="info-card">
      <span className="badge-stage">Rota Estrutural Preparada</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <p className="text-muted">
        <strong>Perfis autorizados nesta rota:</strong>{' '}
        {allowedRoles.map((role) => (
          <code key={role} style={{ marginRight: '0.5rem' }}>
            {role}
          </code>
        ))}
      </p>
      {profile && (
        <p className="text-muted">
          <strong>Sessão atual:</strong> {profile.full_name} (<code>{profile.role}</code>)
        </p>
      )}
      <div className="card-footer-actions">
        <Link to="/" className="btn-secondary">
          Voltar para a Página Inicial
        </Link>
      </div>
    </section>
  );
}
