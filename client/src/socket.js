/*
import { io } from 'socket.io-client';
export const connect = (auth) => io({ auth });
*/
import { io } from 'socket.io-client';

// With 100+ clients on one deploy, a brief network hiccup makes them all try to reconnect at the
// same moment - a "thundering herd" that can itself cause the timeouts it's trying to recover
// from. randomizationFactor spreads those retries out instead of everyone hitting the server in
// the same instant; timeout is raised from the default 20s so a slow response during a traffic
// spike doesn't get treated as a dead connection.
export const connect = (auth) =>
  io({
    auth,
    timeout: 20000,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
  });