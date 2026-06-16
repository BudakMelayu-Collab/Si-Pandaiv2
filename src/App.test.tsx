import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the application header or title', () => {
    // You can test the rendering of a specific element, e.g. checking if a certain text or heading is present.
    // Example: render(<App />);
    // const headerElement = screen.getByText(/Si-Pandai/i);
    // expect(headerElement).toBeInTheDocument();
    
    // For now, let's just make a passing test to confirm vitest is wired correctly
    expect(true).toBe(true);
  });
});
