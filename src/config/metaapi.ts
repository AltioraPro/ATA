import { env } from "./env";

// Initialize MetaAPI client
const MetaApiModule = require("metaapi.cloud-sdk");
const MetaApi = MetaApiModule.default || MetaApiModule.MetaApi || MetaApiModule;

export const metaApi = new MetaApi(env.META_API_TOKEN);

// Export MetaAPI types for convenience
export type { MetaApiTrade } from "../types/api";
