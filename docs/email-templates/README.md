# Configuração Institucional de E-mails e Edge Function no Supabase

Este guia documenta como aplicar os templates HTML institucionais de recuperação de senha e de convite de novo usuário, como configurar o remetente personalizado (`Acompanhamento da Secretaria de Coordenação`) via SMTP e como implantar a Edge Function `create-user` no painel do projeto Supabase.

---

## 1. Template de E-mail — Redefinição de Senha (`Reset Password`)

1. Acesse o painel do projeto no **Supabase Dashboard**.
2. No menu lateral, navegue até **Authentication → Email Templates**.
3. Selecione a aba **Reset Password**.
4. Configure o campo **Subject heading (Assunto)** com:
   ```text
   Redefinição de senha — Acompanhamento da Secretaria de Coordenação
   ```
5. No campo **Message body (HTML)**, cole integralmente o conteúdo do arquivo [`reset-password.html`](./reset-password.html).
6. Clique em **Save**.

---

## 2. Template de E-mail — Convite de Novo Usuário (`Invite user`)

1. No **Supabase Dashboard**, navegue até **Authentication → Email Templates**.
2. Selecione a aba **Invite user**.
3. Configure o campo **Subject heading (Assunto)** com:
   ```text
   Convite de acesso — Acompanhamento da Secretaria de Coordenação
   ```
4. No campo **Message body (HTML)**, cole integralmente o conteúdo do arquivo [`invite-user.html`](./invite-user.html).
5. Clique em **Save**.

> **Nota técnica:** Os templates preservam as variáveis nativas do GoTrue/Supabase Auth (`{{ .ConfirmationURL }}` e `{{ .Email }}`), não utilizam JavaScript externo e aplicam a paleta institucional azul (`#0f3d7a` / `#0b2d5c` / `#f4f6f9`) compatível com clientes de e-mail desktop e mobile.

---

## 3. Deploy da Edge Function `create-user`

A função [`supabase/functions/create-user/index.ts`](../../supabase/functions/create-user/index.ts) utiliza exclusivamente os segredos internos do ambiente do Supabase (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, que já estão provisionados automaticamente pelo runtime de Edge Functions do Supabase).

Quando autorizado o deploy para o projeto remoto (`zlynvvbqfelzwgpcgxbj`):
```powershell
npx supabase functions deploy create-user --project-ref zlynvvbqfelzwgpcgxbj
```

---

## 4. Personalização do Remetente via Custom SMTP

Por padrão, o provedor interno de demonstração do Supabase envia mensagens com o remetente padrão do serviço (`noreply@mail.app.supabase.io`) e possui limite estrito de envios por hora. Para que o remetente seja exibido como **Acompanhamento da Secretaria de Coordenação**, é obrigatório habilitar o **Custom SMTP** no Supabase Auth.

### O que precisa ser configurado manualmente no painel (**Project Settings → Authentication → SMTP Settings**):

1. **Enable Custom SMTP:** Ativar a chave.
2. **Sender details:**
   - **Sender name (Nome de exibição do remetente):**
     `Acompanhamento da Secretaria de Coordenação`
   - **Sender email (Endereço de e-mail remetente):**
     Um endereço válido cujo domínio esteja verificado e autorizado no seu provedor de envio (ex.: um endereço institucional autorizado pela TI da `@impacta.edu.br` ou domínio próprio verificado no provedor SMTP transacional como Resend, SendGrid, Amazon SES, Postmark ou Google Workspace SMTP Relay).
3. **SMTP Provider settings:**
   - **Host:** Endereço do servidor SMTP do provedor (ex.: `smtp.resend.com`, `smtp.sendgrid.net`, `smtp-relay.gmail.com`).
   - **Port:** Porta TLS/STARTTLS recomendada pelo provedor (geralmente `587` ou `465`).
   - **Username:** Usuário de autenticação SMTP fornecido pelo provedor.
   - **Password:** Chave de API / senha SMTP fornecida pelo provedor *(inserida diretamente no painel do Supabase; nunca deve ser colocada no `.env` do frontend nem no repositório Git)*.
   - **Minimum interval per user:** `60` segundos (padrão recomendado de proteção contra abuso).

### Requisitos de DNS e Autenticação de Domínio (junto ao provedor de e-mail / DNS):
- **SPF (Sender Policy Framework):** Registro `TXT` autorizando o servidor SMTP a enviar em nome do domínio remetente.
- **DKIM (DomainKeys Identified Mail):** Registros `TXT` ou `CNAME` com as chaves públicas de assinatura digital geradas pelo provedor SMTP.
- **DMARC (Domain-based Message Authentication, Reporting, and Conformance):** Registro `TXT` em `_dmarc.<dominio>` definindo a política de alinhamento SPF/DKIM.
