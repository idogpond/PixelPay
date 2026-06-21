export const paymentReceivedEmail = (params: { displayName: string; amount: number }) => ({
  subject: `[PixelPay] Wallet Top-Up Successful`,
  html: `
    <h2>Hi ${params.displayName},</h2>
    <p>Your wallet has been topped up with <strong>${params.amount} THB</strong>.</p>
    <p>Your balance is now ready to use on PixelPay.</p>
  `,
});
