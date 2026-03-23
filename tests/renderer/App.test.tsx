import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../../src/renderer/App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByTestId('app-container')).toBeInTheDocument();
  });

  it('renders a sidebar', () => {
    render(<App />);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('renders a header with app title', () => {
    render(<App />);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByText('Switchboard')).toBeInTheDocument();
  });

  it('renders a terminal area', () => {
    render(<App />);
    expect(screen.getByTestId('terminal-area')).toBeInTheDocument();
  });

  it('renders Sessions heading in sidebar', () => {
    render(<App />);
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  it('renders a disabled New Session button', () => {
    render(<App />);
    const button = screen.getByText('+ New Session');
    expect(button).toBeDisabled();
  });
});
