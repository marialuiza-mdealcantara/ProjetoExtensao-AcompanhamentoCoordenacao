import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { HomePage } from '../pages/HomePage';
import { inspectRecoveryOrInviteUrl } from '../pages/ResetPasswordPage';
import { LoginPage } from '../pages/LoginPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { PlaceholderModulePage } from '../pages/PlaceholderModulePage';
import { UsersManagementPage } from '../pages/secretaria/UsersManagementPage';
import { AbsenceDetailPage } from '../pages/absences/AbsenceDetailPage';
import { AbsenceFormPage } from '../pages/absences/AbsenceFormPage';
import { AbsencesListPage } from '../pages/absences/AbsencesListPage';
import { AcademicManagementPage } from '../pages/secretaria/AcademicManagementPage';
import { AbsenceDocumentsListPage } from '../pages/secretaria/AbsenceDocumentsListPage';
import { JustificationsPage } from '../pages/justifications/JustificationsPage';
import { MakeupsPage } from '../pages/makeups/MakeupsPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';

function HomeRoute() {
  const location = useLocation();
  const authCallback = inspectRecoveryOrInviteUrl(location.search, location.hash);
  if (authCallback.hasFlowType || authCallback.hasUrlError) {
    return (
      <Navigate
        to={{ pathname: '/redefinir-senha', search: `?type=${authCallback.flowType}` }}
        replace
      />
    );
  }
  return <HomePage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Rotas públicas e de autenticação */}
        <Route index element={<HomeRoute />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="recuperar-senha" element={<ForgotPasswordPage />} />
        <Route path="redefinir-senha" element={<ResetPasswordPage />} />
        <Route path="acesso-restrito" element={<UnauthorizedPage />} />

        {/* Rotas autenticadas para qualquer perfil ativo válido (PROFESSOR, SECRETARIA, COORDENADOR) */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={['PROFESSOR', 'SECRETARIA', 'COORDENADOR']}
            />
          }
        >
          <Route
            path="painel"
            element={<DashboardPage />}
          />
        </Route>

        {/* Rotas exclusivas para SECRETARIA */}
        <Route element={<ProtectedRoute allowedRoles={['SECRETARIA']} />}>
          <Route path="secretaria">
            <Route index element={<UsersManagementPage />} />
            <Route path="usuarios" element={<UsersManagementPage />} />
            <Route path="gestao-academica" element={<AcademicManagementPage />} />
            <Route path="atestados" element={<AbsenceDocumentsListPage />} />
            <Route path="justificativas" element={<JustificationsPage />} />
            <Route path="reposicoes" element={<MakeupsPage />} />
            <Route path="reposicoes/:makeupId" element={<MakeupsPage />} />
            <Route path="ausencias" element={<AbsencesListPage />} />
            <Route path="ausencias/nova" element={<AbsenceFormPage />} />
            <Route path="ausencias/:absenceId" element={<AbsenceDetailPage />} />
            <Route
              path="*"
              element={<Navigate to="/secretaria/usuarios" replace />}
            />
          </Route>
        </Route>

        {/* Rotas exclusivas para COORDENADOR */}
        <Route element={<ProtectedRoute allowedRoles={['COORDENADOR']} />}>
          <Route path="coordenacao">
            <Route index element={<Navigate to="/coordenacao/ausencias" replace />} />
            <Route path="ausencias" element={<AbsencesListPage />} />
            <Route path="ausencias/:absenceId" element={<AbsenceDetailPage />} />
            <Route path="justificativas" element={<JustificationsPage />} />
            <Route path="reposicoes" element={<MakeupsPage />} />
            <Route path="reposicoes/:makeupId" element={<MakeupsPage />} />
            <Route
              path="*"
              element={
                <PlaceholderModulePage
                  title="Área da Coordenação de Curso"
                  description="Área reservada ao Coordenador para acompanhar os cursos vinculados."
                  allowedRoles={['COORDENADOR']}
                />
              }
            />
          </Route>
        </Route>

        {/* Rotas exclusivas para PROFESSOR */}
        <Route element={<ProtectedRoute allowedRoles={['PROFESSOR']} />}>
          <Route path="professor" element={<AbsencesListPage />} />
          <Route path="professor/justificativas" element={<JustificationsPage />} />
          <Route path="professor/reposicoes" element={<MakeupsPage />} />
          <Route path="professor/reposicoes/:makeupId" element={<MakeupsPage />} />
          <Route path="professor/ausencias" element={<AbsencesListPage />} />
          <Route path="professor/ausencias/nova" element={<AbsenceFormPage />} />
          <Route
            path="professor/ausencias/:absenceId"
            element={<AbsenceDetailPage />}
          />
          <Route
            path="professor/*"
            element={
              <PlaceholderModulePage
                title="Área do Professor"
                description="Estrutura de rota reservada ao Professor (registro de ausências próprias, sugestão de substitutos, envio de atestados, justificativas e evidências de reposição)."
                allowedRoles={['PROFESSOR']}
              />
            }
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
