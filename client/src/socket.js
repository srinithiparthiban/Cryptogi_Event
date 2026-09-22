import { io } from 'socket.io-client';
export const connect = (auth) => io({ auth });
