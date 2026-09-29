import { EventEmitter } from 'node:events';
export const orderEvents = new EventEmitter();
orderEvents.setMaxListeners(100);
export const whatsappEvents = new EventEmitter();
whatsappEvents.setMaxListeners(100);
