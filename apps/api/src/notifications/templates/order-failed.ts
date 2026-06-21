export const orderFailedEmail = (params: {
  displayName: string;
  orderNumber: string;
  productName: string;
}) => ({
  subject: `[PixelPay] Order ${params.orderNumber} Failed`,
  html: `
    <h2>Hi ${params.displayName},</h2>
    <p>Unfortunately, your order <strong>${params.orderNumber}</strong> for <strong>${params.productName}</strong> could not be completed.</p>
    <p>Your wallet balance has been refunded. Please try again or contact support.</p>
  `,
});

export const orderFailedSms = (params: { orderNumber: string }) =>
  `[PixelPay] Order ${params.orderNumber} failed. Your balance has been refunded.`;
