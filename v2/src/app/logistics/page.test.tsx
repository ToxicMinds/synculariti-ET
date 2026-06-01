import { render, screen, fireEvent } from '@testing-library/react';
import LogisticsPage from './page';

// Mocks
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() })
}));
jest.mock('@/modules/identity/hooks/useTenant', () => ({
  useTenant: () => ({ session: {}, tenant: { tenant_id: 't-1' }, loading: false })
}));
jest.mock('@/modules/logistics/hooks/useLogistics', () => ({
  useLogistics: () => ({ items: [], categories: [], stock: [], loading: false, addItem: jest.fn() })
}));
jest.mock('@/components/BentoCard', () => ({ BentoCard: ({ children, title }: any) => <div data-testid="bento">{title}{children}</div> }));
jest.mock('@/components/OrgAccessForm', () => ({ OrgAccessForm: () => <div data-testid="org-form" /> }));
jest.mock('@/modules/logistics/components/ItemCatalog', () => ({ ItemCatalog: () => <div data-testid="item-catalog" /> }));
jest.mock('@/modules/logistics/components/NewItemModal', () => ({ NewItemModal: () => <div data-testid="new-item" /> }));
jest.mock('@/modules/logistics/components/CreatePOModal', () => ({ CreatePOModal: ({ onClose }: any) => <div data-testid="create-po-modal"><button onClick={onClose}>Close</button></div> }));

describe('LogisticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Clicking Create PO opens modal', () => {
    render(<LogisticsPage />);
    const btn = screen.getByText('➕ Create PO');
    fireEvent.click(btn);
    expect(screen.getByTestId('create-po-modal')).toBeInTheDocument();
  });
});
