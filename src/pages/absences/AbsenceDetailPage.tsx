import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  createSubstituteSuggestions,
  fetchAbsenceById,
  fetchAvailableSubstitutes,
  fetchSubstituteSuggestions,
  recordSubstitutionDecision,
  type AbsenceDetails,
  type SubstituteCandidate,
} from '../../services/absenceService';
import type { SubstituteSuggestionRow } from '../../types/database';
import { formatClassification, formatDate } from './absenceFormatting';
import { AbsenceDocumentsPanel } from '../../components/absences/AbsenceDocumentsPanel';
import { JustificationPanel } from '../../components/justifications/JustificationPanel';

export function AbsenceDetailPage() {
  const { profile } = useAuth();
  const { absenceId = '' } = useParams();
  const location = useLocation();
  const isSecretary = profile?.role === 'SECRETARIA';
  const isCoordinator = profile?.role === 'COORDENADOR';
  const isProfessor = profile?.role === 'PROFESSOR';
  const basePath = isSecretary
    ? '/secretaria/ausencias'
    : isCoordinator
      ? '/coordenacao/ausencias'
      : '/professor/ausencias';

  const [absence, setAbsence] = useState<AbsenceDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SubstituteCandidate[]>([]);
  const [candidateAbsenceId, setCandidateAbsenceId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [candidateRequest, setCandidateRequest] = useState(0);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SubstituteSuggestionRow[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionRequest, setSuggestionRequest] = useState(0);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [isSubmittingSuggestions, setIsSubmittingSuggestions] = useState(false);
  const [suggestionSuccess, setSuggestionSuccess] = useState<string | null>(null);
  const suggestionsInFlight = useRef(false);
  const decisionInFlight = useRef(false);

  const loadAbsence = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const item = await fetchAbsenceById(absenceId, profile.role, profile.id);
      setAbsence(item);
      if (!item) {
        setErrorMessage('Registro não encontrado ou sem permissão para consultá-lo.');
      }
    } catch (error: unknown) {
      setAbsence(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os detalhes da ausência.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [absenceId, profile]);

  useEffect(() => {
    void loadAbsence();
  }, [loadAbsence]);

  const hasExistingDecision = Boolean(
    absence && (
      absence.classification !== null ||
      absence.dispensation_id !== null ||
      absence.substitute_id !== null
    )
  );
  const canDecide = Boolean(isCoordinator && absence && !hasExistingDecision);
  const canSuggest = Boolean(
    isProfessor && profile && absence && absence.teacher_id === profile.id && !hasExistingDecision
  );
  const canInspectCandidates = Boolean(
    absence && !hasExistingDecision &&
    (isCoordinator || isSecretary || canSuggest)
  );

  useEffect(() => {
    if (!canInspectCandidates || !absence) {
      setSelectedCandidateId('');
      setCandidateError(null);
      setIsLoadingCandidates(false);
      return;
    }

    let isActive = true;
    setIsLoadingCandidates(true);
    setCandidateError(null);
    setCandidates([]);
    setCandidateAbsenceId(absence.id);
    fetchAvailableSubstitutes(absence.id)
      .then((items) => {
        if (!isActive) return;
        setCandidates(items);
        setCandidateAbsenceId(absence.id);
        setSelectedCandidateId('');
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        setCandidates([]);
        setCandidateError(
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar os professores substitutos.'
        );
      })
      .finally(() => {
        if (isActive) setIsLoadingCandidates(false);
      });

    return () => {
      isActive = false;
    };
  }, [absence, canInspectCandidates, candidateRequest]);

  useEffect(() => {
    if (!absence) return;
    let isActive = true;
    setIsLoadingSuggestions(true);
    setSuggestionError(null);
    fetchSubstituteSuggestions(absence.id)
      .then((items) => {
        if (isActive) setSuggestions(items);
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        setSuggestions([]);
        setSuggestionError(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar as sugestões do professor.'
        );
      })
      .finally(() => {
        if (isActive) setIsLoadingSuggestions(false);
      });
    return () => {
      isActive = false;
    };
  }, [absence?.id, suggestionRequest]);

  const submitSuggestions = async () => {
    if (!absence || !profile || !canSuggest || suggestionsInFlight.current) return;
    if (selectedSuggestionIds.length === 0) {
      setSuggestionError('Selecione ao menos um professor para sugerir.');
      return;
    }
    if (candidateAbsenceId !== absence.id || candidateError || isLoadingCandidates) {
      setSuggestionError('Atualize a lista de professores disponíveis antes de enviar.');
      return;
    }

    suggestionsInFlight.current = true;
    setIsSubmittingSuggestions(true);
    setSuggestionError(null);
    setSuggestionSuccess(null);
    try {
      await createSubstituteSuggestions(absence.id, selectedSuggestionIds, profile.id);
      setSelectedSuggestionIds([]);
      setSuggestionSuccess('Sugestões registradas. Elas não confirmam uma substituição.');
      setSuggestionRequest((value) => value + 1);
      await loadAbsence();
    } catch (error: unknown) {
      setSuggestionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível registrar as sugestões. Tente novamente.'
      );
    } finally {
      suggestionsInFlight.current = false;
      setIsSubmittingSuggestions(false);
    }
  };

  const submitDecision = async (substituteId: string | null) => {
    if (!absence || !isCoordinator || decisionInFlight.current || hasExistingDecision) {
      return;
    }
    if (substituteId && !candidates.some(({ teacher_id }) => teacher_id === substituteId)) {
      return;
    }

    decisionInFlight.current = true;
    setIsSubmittingDecision(true);
    setDecisionError(null);
    setDecisionSuccess(null);
    const selectedCandidate = candidates.find(
      ({ teacher_id }) => teacher_id === substituteId
    );

    try {
      await recordSubstitutionDecision(absence.id, substituteId);
      const classification = substituteId ? 'SUBSTITUIDA' : 'VAGA';
      setAbsence((current) => current && ({
        ...current,
        substitute_id: substituteId,
        substitute_selected_by: substituteId ? profile?.id ?? null : null,
        substitute_selected_at: substituteId ? new Date().toISOString() : null,
        substitute_name: selectedCandidate?.full_name ?? null,
        classification,
        dispensation_id: null,
      }));
      setDecisionSuccess(
        substituteId
          ? 'Substituição confirmada com sucesso.'
          : 'Ocorrência registrada como vaga.'
      );

      try {
        const refreshed = await fetchAbsenceById(absence.id, profile!.role, profile!.id);
        if (refreshed) {
          setAbsence({
            ...refreshed,
            substitute_name: refreshed.substitute_name ?? selectedCandidate?.full_name ?? null,
          });
        }
      } catch {
        // A decisão já foi confirmada; mantém o estado local atualizado.
      }
    } catch (error: unknown) {
      setDecisionError(
        error instanceof Error
          ? error.message
          : 'Não foi possível registrar a decisão. Atualize os dados e tente novamente.'
      );
    } finally {
      decisionInFlight.current = false;
      setIsSubmittingDecision(false);
    }
  };

  return (
    <section className="info-card">
      <span className="badge-stage">Detalhes do registro</span>
      <h2>Ausência</h2>

      {location.search.includes('created=1') && (
        <div className="alert-box alert-ok" role="status">
          Ausência registrada com sucesso.
        </div>
      )}

      {isLoading ? (
        <div className="state-box" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Carregando detalhes...</p>
        </div>
      ) : errorMessage ? (
        <div className="alert-box alert-danger" role="alert">
          {errorMessage}
          <div className="card-footer-actions">
            <button className="btn-secondary" type="button" onClick={() => void loadAbsence()}>
              Tentar novamente
            </button>
          </div>
        </div>
      ) : absence ? (
        <>
          <div className="grid-two">
            {(isSecretary || isCoordinator) && (
              <div className="meta-box">
                <strong>Professor titular</strong>
                <span>{absence.teacher_name}</span>
                {isSecretary && absence.teacher_email && <span>{absence.teacher_email}</span>}
              </div>
            )}
            <div className="meta-box">
              <strong>Data da aula</strong>
              <span>{formatDate(absence.class_date)}</span>
              <span>{absence.term_name}</span>
            </div>
            <div className="meta-box">
              <strong>Oferta</strong>
              <span>{absence.subject_name}</span>
              <span>
                {absence.classes.length > 0
                  ? absence.classes.map(({ courseName, name }) => `${courseName} — ${name}`).join(', ')
                  : 'Turma não disponível'}
              </span>
            </div>
            <div className="meta-box">
              <strong>Horário</strong>
              <span>
                {absence.start_time.slice(0, 5)}–{absence.end_time.slice(0, 5)}
                {absence.room ? ` · ${absence.room}` : ''}
              </span>
            </div>
            <div className="meta-box">
              <strong>Situação da ocorrência</strong>
              <span>{formatClassification(absence.classification)}</span>
              {absence.classification === 'DISPENSADA' && (
                <span>Dispensa institucional registrada</span>
              )}
            </div>
            {absence.classification === 'SUBSTITUIDA' && absence.substitute_id && (
              <div className="meta-box">
                <strong>Professor substituto confirmado</strong>
                <span>
                  {absence.substitute_name ?? `ID ${absence.substitute_id}`}
                </span>
              </div>
            )}
            <div className="meta-box">
              <strong>Registro</strong>
              <span>Criado em {formatDate(absence.created_at)}</span>
              <span>ID: <code>{absence.id}</code></span>
            </div>
            {absence.reason && (
              <div className="meta-box">
                <strong>Observação</strong>
                <span>{absence.reason}</span>
              </div>
            )}
          </div>

          <AbsenceDocumentsPanel absenceId={absence.id} />
          <JustificationPanel absenceId={absence.id} />

          <section className="role-box" aria-labelledby="substitute-suggestions-title">
            <h3 id="substitute-suggestions-title">Sugestões do professor titular</h3>
            <p className="text-muted">
              Sugestões auxiliam a análise e não confirmam a substituição.
            </p>

            {isLoadingSuggestions ? (
              <div className="state-box" role="status" aria-live="polite">
                <span className="spinner" aria-hidden="true" />
                <p>Carregando sugestões...</p>
              </div>
            ) : suggestionError && !canSuggest ? (
              <div className="alert-box alert-danger" role="alert">
                {suggestionError}
                <div className="card-footer-actions">
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setSuggestionRequest((value) => value + 1)}
                  >
                    Tentar novamente
                  </button>
                </div>
              </div>
            ) : suggestions.length === 0 ? (
              <p className="text-muted">Nenhuma sugestão foi registrada.</p>
            ) : (
              <ul>
                {suggestions.map((suggestion) => {
                  const candidate = candidateAbsenceId === absence.id
                    ? candidates.find(({ teacher_id }) =>
                        teacher_id === suggestion.suggested_teacher_id
                      )
                    : undefined;
                  const availabilityChecked =
                    canInspectCandidates &&
                    candidateAbsenceId === absence.id &&
                    !isLoadingCandidates &&
                    !candidateError;
                  return (
                    <li key={suggestion.id}>
                      <strong>
                        {candidate?.full_name ?? `ID ${suggestion.suggested_teacher_id}`}
                      </strong>
                      {' — '}
                      {availabilityChecked
                        ? candidate
                          ? 'Disponível na consulta atual'
                          : 'Não disponível na consulta atual'
                        : 'Disponibilidade não consultada'}
                      <span className="text-muted">
                        {' · '}{new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(suggestion.created_at))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {canSuggest && (
              <div className="form-group">
                <span className="form-label">Indique um ou mais professores disponíveis</span>
                {candidateError ? (
                  <div className="alert-box alert-danger" role="alert">
                    {candidateError}
                    <div className="card-footer-actions">
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() => setCandidateRequest((value) => value + 1)}
                      >
                        Atualizar professores disponíveis
                      </button>
                    </div>
                  </div>
                ) : isLoadingCandidates ? (
                  <div className="state-box" role="status" aria-live="polite">
                    <span className="spinner" aria-hidden="true" />
                    <p>Consultando professores disponíveis...</p>
                  </div>
                ) : candidates.filter(({ teacher_id }) =>
                  !suggestions.some((suggestion) =>
                    suggestion.suggested_teacher_id === teacher_id
                  )
                ).length === 0 ? (
                  <p className="text-muted">
                    Não há professores disponíveis adicionais para sugerir.
                  </p>
                ) : (
                  <div className="course-selection-block">
                    {candidates
                      .filter(({ teacher_id }) => !suggestions.some(
                        (suggestion) => suggestion.suggested_teacher_id === teacher_id
                      ))
                      .map((candidate) => (
                        <label
                          className={`course-checkbox-card ${
                            selectedSuggestionIds.includes(candidate.teacher_id)
                              ? 'course-checkbox-card-selected'
                              : ''
                          }`}
                          key={candidate.teacher_id}
                        >
                          <input
                            type="checkbox"
                            checked={selectedSuggestionIds.includes(candidate.teacher_id)}
                            onChange={(event) => {
                              setSelectedSuggestionIds((current) => event.target.checked
                                ? [...current, candidate.teacher_id]
                                : current.filter((id) => id !== candidate.teacher_id));
                            }}
                            disabled={isSubmittingSuggestions}
                          />
                          <span>{candidate.full_name}</span>
                        </label>
                      ))}
                  </div>
                )}
                {suggestionError && (
                  <div className="alert-box alert-danger" role="alert">
                    {suggestionError}
                  </div>
                )}
                {suggestionSuccess && (
                  <div className="alert-box alert-ok" role="status">
                    {suggestionSuccess}
                  </div>
                )}
                <div className="card-footer-actions">
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={
                      isSubmittingSuggestions || isLoadingCandidates || Boolean(candidateError) ||
                      selectedSuggestionIds.length === 0
                    }
                    onClick={() => void submitSuggestions()}
                  >
                    {isSubmittingSuggestions ? 'Enviando sugestões...' : 'Registrar sugestões'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {isCoordinator && hasExistingDecision && absence.classification === null && (
            <div className="alert-box alert-warn" role="status">
              Há dados de decisão associados, mas a ocorrência não possui classificação final. Atualize ou consulte a Secretaria antes de prosseguir.
            </div>
          )}

          {canDecide && (
            <section className="role-box" aria-labelledby="substitution-decision-title">
              <h3 id="substitution-decision-title">Decisão de substituição</h3>
              <p className="text-muted">
                Escolha um professor disponível ou registre a ocorrência como vaga.
              </p>

              {isLoadingCandidates ? (
                <div className="state-box" role="status" aria-live="polite">
                  <span className="spinner" aria-hidden="true" />
                  <p>Consultando professores disponíveis...</p>
                </div>
              ) : candidateError ? (
                <div className="alert-box alert-danger" role="alert">
                  {candidateError}
                  <div className="card-footer-actions">
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => setCandidateRequest((value) => value + 1)}
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              ) : candidates.length === 0 ? (
                <div className="state-box">
                  <p>Nenhum professor disponível foi retornado para esta ocorrência.</p>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label" htmlFor="substitute-candidate">
                    Professor substituto
                  </label>
                  <select
                    id="substitute-candidate"
                    className="form-input"
                    value={selectedCandidateId}
                    onChange={(event) => setSelectedCandidateId(event.target.value)}
                    disabled={isSubmittingDecision}
                  >
                    <option value="">Selecione um professor</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.teacher_id} value={candidate.teacher_id}>
                        {candidate.full_name}
                        {suggestions.some(
                          (suggestion) => suggestion.suggested_teacher_id === candidate.teacher_id
                        ) ? ' — sugerido pelo titular' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {decisionError && (
                <div className="alert-box alert-danger" role="alert">
                  {decisionError}
                </div>
              )}
              {decisionSuccess && (
                <div className="alert-box alert-ok" role="status">
                  {decisionSuccess}
                </div>
              )}

              <div className="card-footer-actions">
                <button
                  className="btn-primary"
                  type="button"
                  disabled={
                    isSubmittingDecision || isLoadingCandidates || Boolean(candidateError) ||
                    !selectedCandidateId
                  }
                  onClick={() => void submitDecision(selectedCandidateId)}
                >
                  {isSubmittingDecision ? 'Salvando...' : 'Confirmar substituição'}
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={isSubmittingDecision || isLoadingCandidates || Boolean(candidateError)}
                  onClick={() => void submitDecision(null)}
                >
                  {isSubmittingDecision ? 'Salvando...' : 'Registrar vaga'}
                </button>
              </div>
            </section>
          )}
        </>
      ) : null}

      <div className="card-footer-actions">
        <Link className="btn-secondary" to={basePath}>
          Voltar às ausências
        </Link>
      </div>
    </section>
  );
}
