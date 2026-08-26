export function notifyNewAccount(email: string, provider: 'email' | 'google') {
  // fire-and-forget — never await this in the signup flow
  fetch('/api/notify-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, provider }),
  }).catch(() => {});
}