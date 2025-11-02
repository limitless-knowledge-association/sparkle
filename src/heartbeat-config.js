/**
 * Heartbeat configuration
 * Shared between server and client for consistent timeout behavior
 */

// Server sends heartbeat every 1 second
export const HEARTBEAT_INTERVAL_MS = 1000;

// Client considers server lost if no heartbeat received for 5 seconds
export const HEARTBEAT_TIMEOUT_MS = 5000;
