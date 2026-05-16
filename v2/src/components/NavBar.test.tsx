import { render } from '@testing-library/react';
import { NavBar } from './NavBar';
import { useNavigation } from '@/hooks/useNavigation';

// Mock useNavigation
jest.mock('@/hooks/useNavigation', () => ({
  useNavigation: jest.fn()
}));

// Mock NavBarContent to isolate the top-level NavBar shell
jest.mock('./navbar/NavBarContent', () => ({
  NavBarContent: () => <div data-testid="dynamic-content" />
}));

describe('NavBar Static Safety (Batch F-Fix Contract)', () => {
  it('should NOT call useNavigation at the top level component (Hollow Shell)', () => {
    /**
     * By mocking NavBarContent, we ensure that we are only testing
     * the code inside the NavBar() function body.
     */
    render(<NavBar />);
    
    // This should now PASS because NavBar() no longer calls the hook.
    expect(useNavigation).not.toHaveBeenCalled();
  });
});
