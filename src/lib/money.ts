// Amounts in so'm, written the same way for every visitor. toLocaleString()
// with no locale followed the browser's language, so one student saw
// "20,000 UZS" and another "20 000 UZS" or "20.000 UZS". The no-break space
// keeps the number and "UZS" on one line.

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const formatUZS = (amount: number) => `${whole.format(amount)} UZS`;

/** The number alone, for text that names the currency itself. */
export const formatSum = (amount: number) => whole.format(amount);
