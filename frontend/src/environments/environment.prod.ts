/**
 * Production build configuration. See `environment.ts` for what each field does.
 *
 * Kept demo-mode by default so the Netlify build continues to deploy standalone with
 * no backend, exactly as the React build did. Set `authEnabled: true` to restore the
 * real Cognito flow.
 */
export const environment = {
  production: true,
  authEnabled: false,
  shopAdminOrderUrl: '',
};
