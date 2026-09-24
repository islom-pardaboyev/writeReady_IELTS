/**
 * The facts the Privacy Policy and Terms both quote. They live here so the two
 * pages can never drift apart, and so the details that need a real business
 * behind them are in one obvious place.
 *
 * TODO (owner): replace `entity` and `address` with the registered business
 * name and address once WriteReady is registered, and add a written contact
 * address in `email`. A policy that names no legal person and gives no way to
 * write to it is hard to enforce and hard to rely on.
 */
export const LEGAL = {
  service: 'WriteReady IELTS',
  site: 'writeready.uz',
  /** The business behind the service. */
  entity: 'WriteReady IELTS',
  address: 'Uzbekistan',
  country: 'Uzbekistan',
  /** Where users can reach a human today. */
  telegram: 'writeready_admin',
  /** TODO (owner): a mailbox you actually read. Telegram alone is thin for a privacy request. */
  email: '',
  /** Change this whenever the wording of either document changes. */
  updated: '24 September 2026',
} as const;

export const TELEGRAM_CONTACT_URL = `https://t.me/${LEGAL.telegram}`;

/**
 * IELTS is a registered trademark of the British Council, IDP: IELTS Australia
 * and Cambridge University Press & Assessment. WriteReady is not connected to
 * any of them, and saying so plainly is both fair use and good manners.
 */
export const IELTS_DISCLAIMER =
  'WriteReady is not affiliated with, endorsed by or connected to the British Council, IDP: IELTS Australia or Cambridge University Press & Assessment. IELTS is their registered trademark. Band scores shown here are estimates produced by AI, not official IELTS results.';
