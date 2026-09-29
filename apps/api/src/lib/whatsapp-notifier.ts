export type WhatsAppNotification = {
  restaurantId: string;
  customerId: string;
  phone: string;
  text: string;
};

type WhatsAppSender = (notification: WhatsAppNotification) => Promise<boolean>;

let sender: WhatsAppSender | undefined;

export function registerWhatsAppSender(nextSender: WhatsAppSender) {
  sender = nextSender;
}

export async function sendWhatsAppNotification(notification: WhatsAppNotification) {
  return sender ? sender(notification) : false;
}
