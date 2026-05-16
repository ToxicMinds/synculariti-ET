/**
 * Synculariti-ET Unified Logging Taxonomy
 * Single Source of Truth for system components and log levels.
 */

export type LogComponent = 
  | 'API' 
  | 'Neo4j' 
  | 'Scanner' 
  | 'Auth' 
  | 'Security' 
  | 'Sync' 
  | 'AI' 
  | 'Finance' 
  | 'Logistics' 
  | 'eKasa' 
  | 'OfflineQueue' 
  | 'Utils'
  | 'Banking'
  | 'Export'
  | 'Debug'
  | 'Usage'
  | 'Camera';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'PERF';
