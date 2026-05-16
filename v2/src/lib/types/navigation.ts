/**
 * Synculariti-ET Navigation & Viewport Primitives
 */

export interface NavigationMonth {
  value: string; // ISO format: "YYYY-MM"
  label: string; // Human readable: "May 2026"
}

export interface ModuleDescriptor {
  id: string;
  name: string;
  path: string;
  icon: string;
  logo: string;
}

export interface UseNavigationOptions {
  basePath?: string;
  earliestDataDate?: string; // "2024-01-01"
}

export interface UseNavigationReturn {
  // Data
  months: NavigationMonth[];
  selectedMonth: string; 
  activeModule: ModuleDescriptor;
  modules: ModuleDescriptor[];
  
  // Logic
  isCurrentMonth: boolean;
  isChanging: boolean; // React transition state
  
  // Actions
  actions: {
    setMonth: (monthISO: string) => void;
    setModule: (path: string) => void;
    refresh: () => void;
  };
}
