export const orderCompletedEmail = (params: {
  displayName: string;
  orderNumber: string;
  productName: string;
  gameUid: string;
}) => ({
  subject: `[PixelPay] Order ${params.orderNumber} Completed`,
  html: `
    <h2>Hi ${params.displayName},</h2>
    <p>Your order <strong>${params.orderNumber}</strong> has been completed successfully!</p>
    <p><strong>Product:</strong> ${params.productName}<br>
    <strong>Game UID:</strong> ${params.gameUid}</p>
    <p>Thank you for using PixelPay!</p>
  `,
});

export const orderCompletedSms = (params: { orderNumber: string; productName: string }) =>
  `[PixelPay] Order ${params.orderNumber} completed: ${params.productName}. Thank you!`;
