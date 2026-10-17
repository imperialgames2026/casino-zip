import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.jsx';
let source = readFileSync(path, 'utf8');
const replace = (before, after) => {
  if (!source.includes(before)) throw new Error('Legacy App.jsx patch mismatch: ' + before.slice(0, 85));
  source = source.replace(before, after);
};

replace(
  "import ExclusionBanner from './components/casino/ExclusionBanner';",
  "import ExclusionBanner from './components/casino/ExclusionBanner';\nimport SupabaseSignIn from './components/SupabaseSignIn';"
);
replace(
  ".catch(() => setStatus('ok'));",
  ".catch(() => setStatus('unverified'));"
);
replace(
  "if (status === 'excluded') return <ExclusionBanner />;",
  "if (status === 'excluded') return <ExclusionBanner />;\n  if (status !== 'ok') return <div role=\"alert\">Unable to verify account eligibility. Gameplay is unavailable.</div>;"
);
replace(
  "const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();",
  "const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, user } = useAuth();"
);
replace(
  "navigateToLogin();\n      return null;",
  "return <SupabaseSignIn />;"
);
replace(
  "  // Render the main app\n  return (",
  "  if (authError && authError.type !== 'auth_required') return <main role=\"alert\" style={{padding:32}}>Account verification unavailable: {authError.message}</main>;\n  // Render the main app\n  return ("
);
replace(
  "  // Render the main app\n  return (",
  `  if (!isAuthenticated) return <SupabaseSignIn />;
  if (user?.is_excluded) return <ExclusionBanner />;
  // Server-side functions also deny gameplay mutations. The migration preview
  // must not expose old client-authoritative wagering or identity collection.
  const approvedRoutes = new Set([
    '/', '/Home', '/Profile', '/TransactionHistory', '/PrivacyPolicy',
    '/TermsOfService', '/CookiesPolicy', '/ResponsiblePlay',
    '/FairnessManifesto', '/Licensing',
  ]);
  const currentRoute = window.location.pathname.replace(/\\/+$/, '') || '/';
  if (!approvedRoutes.has(currentRoute)) return <main role="alert" style={{padding:32}}>
    <h1>Imperial Games migration preview</h1>
    <p>This page is disabled until its operations have been migrated and verified in Supabase.</p>
  </main>;
  // Render preserved read-only screens from the original app.
  return (`
);
writeFileSync(path, source);
