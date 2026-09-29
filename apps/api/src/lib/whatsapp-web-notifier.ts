export type WhatsAppWebNotification = {
  restaurantId: string;
  customerId: string;
  phone: string;
  text: string;
};

type WhatsAppWebSender = (notification: WhatsAppWebNotification) => Promise<boolean>;

let sender: WhatsAppWebSender | undefined;

export function registerWhatsAppWebSender(nextSender: WhatsAppWebSender) {
  sender = nextSender;
}

export async function sendWhatsAppWebNotification(notification: WhatsAppWebNotification) {
  return sender ? sender(notification) : false;
}
