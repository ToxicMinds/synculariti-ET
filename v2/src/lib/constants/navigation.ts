import { ModuleDescriptor } from '../types/navigation';

export const MODULE_REGISTRY: ModuleDescriptor[] = [
  { 
    id: 'finance', 
    name: 'Finance', 
    icon: '💰', 
    path: '/', 
    logo: '/brand/finance.png' 
  },
  { 
    id: 'logistics', 
    name: 'Logistics', 
    icon: '📦', 
    path: '/logistics', 
    logo: '/brand/logistics.png' 
  },
  { 
    id: 'identity', 
    name: 'Identity', 
    icon: '👤', 
    path: '/settings', 
    logo: '/brand/identity.png' 
  }
];
