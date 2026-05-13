import type { RpcEventName, RpcEvents } from "@shared/types";

type Transport = (event: string, payload: unknown) => void;

let transport: Transport = () => {};

export function registerEventsTransport(t: Transport) {
  transport = t;
}

export function emit<N extends RpcEventName>(name: N, payload: RpcEvents[N]) {
  transport(name, payload);
}
