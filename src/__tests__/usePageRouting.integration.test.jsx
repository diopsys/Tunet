import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { usePageRouting } from '../hooks/usePageRouting';

function PageProbe() {
  const { activePage, setActivePage } = usePageRouting();
  return (
    <>
      <output>{activePage}</output>
      <button onClick={() => setActivePage('office')}>Office</button>
    </>
  );
}

function setup(initialEntries) {
  const router = createMemoryRouter([{ path: '/page/:pageId?', element: <PageProbe /> }], {
    initialEntries,
  });
  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
  return router;
}

describe('page routing with a real router', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the deep link through StrictMode and subsequent UI navigation', async () => {
    localStorage.setItem('tunet_active_page', 'home');
    const router = setup(['/page/energy']);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('energy'));
    expect(router.state.location.pathname).toBe('/page/energy');
    expect(localStorage.getItem('tunet_active_page')).toBe('energy');
    fireEvent.click(screen.getByRole('button', { name: 'Office' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/page/office'));
    expect(screen.getByRole('status')).toHaveTextContent('office');
  });

  it('follows back and forward without replacing the history destination', async () => {
    const router = setup(['/page/home', '/page/energy']);
    await act(async () => router.navigate(-1));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('home'));
    expect(router.state.location.pathname).toBe('/page/home');
    await act(async () => router.navigate(1));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('energy'));
    expect(router.state.location.pathname).toBe('/page/energy');
    expect(localStorage.getItem('tunet_active_page')).toBe('energy');
  });

  it('uses the saved page when the URL has no page parameter', async () => {
    localStorage.setItem('tunet_active_page', 'kitchen');
    const router = setup(['/page']);
    await waitFor(() => expect(router.state.location.pathname).toBe('/page/kitchen'));
    expect(screen.getByRole('status')).toHaveTextContent('kitchen');
  });
});
