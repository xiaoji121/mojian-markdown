export const ENABLE_AGENT_BRIDGE =
  import.meta.env.MODE === 'bridge' || import.meta.env.VITE_ENABLE_AGENT_BRIDGE === 'true';
