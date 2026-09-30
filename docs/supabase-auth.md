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

The current workspace remains a local demo while the client data API is being
connected. Once client records are moved server-side, every read and write
must be scoped to the verified Supabase user ID.
