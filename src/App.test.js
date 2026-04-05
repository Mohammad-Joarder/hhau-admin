import { render, screen } from '@testing-library/react';
import App from './App';

// Full App requires Supabase env + Router; smoke test only.
test('App renders without crashing when env is unset', () => {
  const { container } = render(<App />);
  expect(container).toBeTruthy();
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
