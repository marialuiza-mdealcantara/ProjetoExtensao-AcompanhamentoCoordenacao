# Conecta Acadêmico Impacta

## 1. Nome e descrição

O **Conecta Acadêmico Impacta** é uma aplicação web acadêmica desenvolvida como projeto de extensão da Faculdade Impacta de Tecnologia. O sistema apoia a Secretaria de Coordenação, os Coordenadores de Curso e os Professores no acompanhamento de ausências docentes, substituições, justificativas e reposições de aulas.

## 2. Objetivo

Centralizar registros e fluxos administrativos relacionados à rotina acadêmica, com acesso organizado por perfil e escopo de curso. O sistema também reúne cadastros acadêmicos, documentos associados às ausências e indicadores para acompanhamento.

## 3. Funcionalidades

- **Acesso e autenticação:** login, recuperação de senha e ativação de conta por convite.
- **Página inicial e dashboard:** indicadores, gráficos, pendências, atividades recentes e filtros de período, de acordo com o perfil autenticado; o relatório do dashboard pode ser impresso/exportado em PDF pelo navegador.
- **Ausências:** consulta e registro de ausências vinculadas às ocorrências de aula; acompanhamento de sugestões e decisões de substituição.
- **Atestados:** envio de documentos pelo Professor e registro administrativo de conferência e encaminhamento pela Secretaria. Os arquivos são armazenados em bucket privado.
- **Justificativas:** envio e acompanhamento pelo Professor, encaminhamento ao Coordenador pela Secretaria e registro de decisão pelo Coordenador.
- **Reposições:** cadastro e reagendamento pelo Professor, envio de evidências e conferência administrativa pela Secretaria.
- **Gestão de usuários:** cadastro por convite, listagem e vínculos de cursos de Coordenadores. A edição de nome e o gerenciamento de status usam a Edge Function `manage-user`, implantada no Supabase remoto; a migration de permissões correspondente também já foi aplicada.
- **Gestão acadêmica:** cadastro e edição de cursos, disciplinas e turmas; vínculos entre Coordenadores e cursos; criação e ativação de ofertas de disciplinas; configuração de horários e geração de ocorrências do semestre.

Os registros e ações disponíveis em cada tela dependem das permissões do perfil e das políticas de acesso do Supabase. Algumas rotas estruturais não cobertas por uma tela funcional ainda exibem uma página provisória.

## 4. Perfis de usuário

- **Professor:** acessa seus próprios registros, registra ausências, envia sugestões de substituição, atestados e justificativas, e acompanha ou administra suas reposições e evidências.
- **Coordenador de Curso:** acompanha registros dos cursos associados à sua conta, avalia decisões de substituição e justificativas e consulta as reposições do seu escopo. O acesso a dados e documentos é limitado pelas políticas do Supabase; o Coordenador não acessa o conteúdo de atestados médicos.
- **Secretaria de Coordenação:** possui acesso administrativo aos usuários, à gestão acadêmica e aos registros necessários para acompanhar ausências, conferir documentos, encaminhar justificativas e verificar reposições.

O escopo por perfil é validado pelas rotas protegidas e, principalmente, pelas políticas de Row Level Security (RLS) do banco. Contas inativas ou sem perfil válido não são autorizadas pela aplicação.

## 5. Tecnologias utilizadas

- React 19
- TypeScript 5.7
- Vite 6
- React Router DOM 7
- `@supabase/supabase-js` 2
- Supabase: PostgreSQL, Auth, Storage e Edge Functions
- CSS

## 6. Arquitetura geral

O frontend é uma Single-Page Application (SPA) React com navegação pelo React Router. O `AuthProvider` carrega e valida o perfil institucional, e as rotas protegidas verificam se o usuário está autenticado, ativo e autorizado para o perfil requerido.

O navegador usa a URL e a chave **publishable** do Supabase para acessar os serviços necessários. A autorização sobre linhas e arquivos é aplicada pelas políticas RLS e pelas políticas do Storage. Operações administrativas privilegiadas, como o provisionamento de contas, ficam em Supabase Edge Functions; a chave `service_role` não deve ser incluída no frontend.

## 7. Estrutura do projeto

```text
.
├── docs/                     # Documentação do projeto
├── src/
│   ├── components/           # Layout, autenticação e componentes de domínio
│   ├── contexts/             # Contexto de autenticação
│   ├── hooks/                # Hooks compartilhados
│   ├── pages/                # Páginas e módulos da aplicação
│   ├── routes/               # Rotas e proteção por perfil
│   ├── services/             # Acesso ao Supabase e regras de integração
│   └── types/                # Tipos TypeScript, incluindo o modelo do banco
├── supabase/
│   ├── functions/            # Edge Functions create-user e manage-user
│   └── migrations/           # Migration manage_user_profiles
├── .env.example              # Modelo das variáveis públicas do frontend
├── package.json              # Dependências e scripts
└── vite.config.ts            # Configuração do servidor e do build Vite
```

## 8. Pré-requisitos

- Node.js compatível com Vite 6: `^18.0.0`, `^20.0.0` ou `>=22.0.0`.
- npm.
- Projeto Supabase configurado com as tabelas, políticas RLS, buckets e funções necessários para os módulos que serão utilizados.

O repositório não contém o histórico das migrations iniciais do banco. A pasta `supabase/migrations/` inclui somente `20261119213000_manage_user_profiles.sql`, aplicada com sucesso no Supabase remoto; ela é uma alteração pontual, não um script de criação do banco. Para configurar um projeto Supabase novo, obtenha os scripts aprovados do schema e das políticas antes de tentar provisioná-lo.

## 9. Configuração do ambiente

1. Na raiz do projeto, copie o arquivo de exemplo:

   **PowerShell**

   ```powershell
   Copy-Item .env.example .env
   ```

   **Bash**

   ```bash
   cp .env.example .env
   ```

2. Preencha no `.env` os valores públicos do seu projeto Supabase:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
   ```

   Use os valores correspondentes ao seu projeto. O arquivo `.env` é ignorado pelo Git; não inclua credenciais reais no repositório.

3. **Nunca** use `service_role`, `sb_secret_...` ou outra chave privilegiada em variáveis `VITE_*`. Variáveis com prefixo `VITE_` são incorporadas ao bundle e ficam visíveis no navegador. Segredos exigidos pelas Edge Functions devem permanecer no ambiente server-side do Supabase.

## 10. Como executar localmente

Instale as dependências conforme o lockfile:

```bash
npm ci
```

No PowerShell do Windows, os mesmos comandos podem ser executados com `npm.cmd`:

```powershell
npm.cmd ci
```

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

No PowerShell:

```powershell
npm.cmd run dev
```

O servidor Vite está configurado para a porta `5173`; acesse `http://localhost:5173`. Para verificar o projeto e gerar o bundle de produção:

```bash
npm run lint
npm run build
```

No Windows PowerShell, use `npm.cmd run lint` e `npm.cmd run build`. O comando de build gera os arquivos estáticos em `dist/`. Para servir localmente o build, use `npm run preview` (ou `npm.cmd run preview` no PowerShell).

O `package.json` não define um script de testes automatizados.

## 11. Configuração do Supabase

- Configure no frontend `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- O schema deve incluir as tabelas de perfis, cursos, disciplinas, turmas, ofertas, ausências, justificativas e reposições, além das políticas RLS e dos buckets privados utilizados pela aplicação.
- Configure os URLs de redirecionamento do Supabase Auth para o domínio local e para o domínio de hospedagem, incluindo a rota `/redefinir-senha`, utilizada nos fluxos de convite e recuperação de senha.
- O código das Edge Functions está em `supabase/functions/`. A `create-user` realiza o provisionamento por convite e está implantada no Supabase remoto na versão 2, status `ACTIVE`. A `manage-user`, usada para edição de nome e ativação/desativação, está implantada na versão 1, status `ACTIVE`. A migration `manage_user_profiles` (`20261119213000_manage_user_profiles.sql`) já foi aplicada com sucesso no remoto.
- As migrations iniciais documentadas como aplicadas no Supabase não estão versionadas neste repositório. Portanto, o conteúdo local não é suficiente para recriar todo o banco em um projeto vazio. Não trate a migration pontual acima como bootstrap do schema.

## 12. Observações sobre hospedagem

- O resultado de `npm run build` é uma aplicação estática no diretório `dist/`; o repositório não declara um provedor de hospedagem específico.
- Configure o servidor de hospedagem para servir `index.html` como fallback das rotas da SPA, além de publicar os arquivos de `dist/`.
- Defina as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente de build do provedor. Esses valores são públicos; não configure chaves administrativas no frontend.
- Atualize no Supabase Auth as URLs permitidas para convite e recuperação de senha, incluindo o domínio publicado.
- Edge Functions, configuração do banco, RLS e Storage são componentes separados do bundle estático e precisam permanecer configurados no projeto Supabase. No momento, `create-user` está na versão 2 `ACTIVE`, `manage-user` na versão 1 `ACTIVE`, e a migration `manage_user_profiles` está aplicada; o histórico das migrations anteriores continua ausente do repositório local.
