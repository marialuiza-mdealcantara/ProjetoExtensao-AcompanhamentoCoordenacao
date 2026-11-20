import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  requestPasswordRecoveryEmail,
  validateEmailInput,
} from '../services/authService';

export function ForgotPasswordPage() {
  const { isConfigured } = useAuth();

  const [email, setEmail] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean>(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const validationError = validateEmailInput(email);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await requestPasswordRecoveryEmail(email);
      if (!result.success) {
        setErrorMessage(
          result.errorMessage ??
            'Não foi possível enviar o e-mail de recuperação.'
        );
        return;
      }
      setEmailSent(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <section
        className="info-card auth-card"
        aria-labelledby="forgot-password-heading"
      >
        <div className="auth-header">
          <span className="badge-stage">Recuperação de Acesso (RF09)</span>
          <h2 id="forgot-password-heading">Recuperar Senha</h2>
          <p className="text-muted">
            Informe o e-mail cadastrado na sua conta institucional para receber um
            link temporário seguro de redefinição de senha.
          </p>
        </div>

        {!isConfigured && (
          <div className="alert-box alert-warn" role="alert">
            A conexão com o Supabase não está configurada no arquivo{' '}
            <code>.env</code> local.
          </div>
        )}

        {errorMessage && (
          <div className="alert-box alert-danger" role="alert">
            {errorMessage}
          </div>
        )}

        {emailSent ? (
          <div className="recovery-success-block">
            <div className="alert-box alert-ok" role="status">
              <strong>Solicitação processada (CA05):</strong> Se o endereço{' '}
              <strong>{email.trim()}</strong> estiver cadastrado e ativo no
              sistema, você receberá em instantes um e-mail com o link temporário
              para redefinir sua senha.
            </div>
            <p className="text-muted">
              Verifique sua caixa de entrada e a pasta de spam. O link enviado é
              de uso único e possui prazo de expiração por segurança.
            </p>
            <div className="card-footer-actions">
              <Link to="/login" className="btn-primary">
                Voltar para o Login
              </Link>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEmailSent(false);
                  setErrorMessage(null);
                }}
              >
                Informar outro e-mail
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="recovery-email" className="form-label">
                E-mail institucional cadastrado
              </label>
              <input
                id="recovery-email"
                type="email"
                className="form-input"
                placeholder="nome@impacta.edu.br"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isSubmitting || !isConfigured}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary btn-block"
              disabled={isSubmitting || !isConfigured}
            >
              {isSubmitting
                ? 'Enviando link de recuperação...'
                : 'Enviar Link de Recuperação'}
            </button>

            <div className="card-footer-actions">
              <Link to="/login" className="btn-secondary btn-block">
                Voltar para a Tela de Login
              </Link>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
