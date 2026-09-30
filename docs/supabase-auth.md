# Supabase client sign-in

The client workspace uses Supabase Auth magic links. Admin access remains on
the existing Cloudflare-protected token flow.

## One-time project setup

1. Create a Supabase project and enable Email authentication.
2. Set the Supabase Site URL to the deployed Worker URL.
3. Add the deployed client redirect URL, ending in `/app/`, under the allowed
   redirect URLs.
4. Invite client users from Supabase Authentication → Users. The client flow
   uses `shouldCreateUser: false`, so an uninvited address cannot create an
   account through the sign-in form.
5. Add the project URL and publishable/anon key to the Worker as secrets:

   ```sh
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_ANON_KEY
   ```

6. Apply the `0004_client_workspaces.sql` migration to the production D1
   database before enabling client saves.

The publishable key is returned to the browser by `/api/auth/config`; it is
safe to expose only because Supabase Auth and the server-side session check are
still required. Never use a Supabase service-role key in this Worker or in the
browser.

## How the integration works

- The client page requests public Supabase settings from `/api/auth/config`.
- It sends a one-time link request to Supabase's Auth API.
- After the link returns, the Worker calls Supabase's `/auth/v1/user` endpoint
  to verify the bearer token before opening the workspace.
- The client session endpoint is rate-limited and never returns database data.

Client workspace data is now stored in D1 under the verified Supabase user ID.
The browser keeps a short local copy for responsive editing, while saves are
also sent through the authenticated Worker API. Every read and write is scoped
to the signed-in user; no client can request another user's workspace ID.
