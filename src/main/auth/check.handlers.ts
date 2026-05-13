import { register } from "../rpc/handlers";
import { getAuthStatus } from "./check";

register("getAuthStatus", async () => getAuthStatus());
