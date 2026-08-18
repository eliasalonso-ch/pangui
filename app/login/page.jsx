import LoginForm from "./LoginForm";

/**
 * The auth gate for /login lives entirely in proxy.js, which runs before this
 * renders and already covers every case:
 *
 *   - valid session   -> redirect to /ordenes  (proxy.js, `user && isLogin`)
 *   - no session      -> falls through to this page
 *   - auth error      -> cookies cleared, request continues to this page
 *
 * This component used to repeat that with its own getServerUser(). React.cache()
 * memoizes per render pass, not across the proxy (which runs in a separate
 * runtime before rendering), so the check was a second auth/v1/user round-trip
 * on every hit -- and /login takes a lot of hits: 263 invocations in 12 hours,
 * ~32% of the app's Fluid CPU, none of it work anyone asked for.
 *
 * Keep this a static shell. If the redirect rule ever needs to change, change
 * it in proxy.js -- putting it back here means paying for it twice.
 */
export default function LoginPage() {
  return <LoginForm />;
}
