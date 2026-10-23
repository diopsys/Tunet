import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipAdresse, leseKameraLink, seiteFuerKamera, useKameraLink } from '../hooks/useKameraLink';
import CameraModal from '../modals/CameraModal';

vi.mock('../components/camera/CameraFeed', () => ({ default: () => <div data-testid="feed" /> }));

describe('Kamera-Link aus der Adresse', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('reads camera and Frigate event, rejects anything else', () => {
    expect(leseKameraLink('?kamera=camera.haustuer_klingel_2&clip=1729.5-abc')).toEqual({ kamera: 'camera.haustuer_klingel_2', clip: '1729.5-abc' });
    expect(leseKameraLink('?kamera=camera.garten')).toEqual({ kamera: 'camera.garten', clip: null });
    expect(leseKameraLink('?kamera=camera.garten&clip=../x')).toEqual({ kamera: 'camera.garten', clip: null });
    expect(leseKameraLink('?kamera=light.flur')).toBeNull();
    expect(leseKameraLink('')).toBeNull();
  });

  it('finds the page with a card for this camera', () => {
    const cardSettings = { 'sicherheit::cam_1': { cameraId: 'camera.haustuer' }, 'alt::cam_2': { cameraId: 'camera.garten' } };
    const pagesConfig = { sicherheit: ['cam_1'], alt: [] };
    expect(seiteFuerKamera('camera.haustuer', cardSettings, pagesConfig)).toBe('sicherheit');
    expect(seiteFuerKamera('camera.garten', cardSettings, pagesConfig)).toBeNull(); // Karte nicht mehr auf der Seite
    expect(seiteFuerKamera('camera.hof', cardSettings, pagesConfig)).toBeNull();
  });

  it('builds the clip address', () => {
    expect(clipAdresse('ev1', 'https://ha.example/')).toBe('https://ha.example/api/frigate/notifications/ev1/clip.mp4');
    expect(clipAdresse('ev1')).toBe('/api/frigate/notifications/ev1/clip.mp4');
    expect(clipAdresse(null)).toBeNull();
  });

  it('opens from the address, clears it and reacts to later navigation', () => {
    window.history.replaceState(null, '', '/local_tunet_casa?kamera=camera.haustuer&clip=ev1&x=1');
    const { result } = renderHook(() => useKameraLink());
    expect(result.current[0]).toMatchObject({ kamera: 'camera.haustuer', clip: 'ev1' });
    expect(window.location.search).toBe('?x=1');

    act(() => result.current[1]());
    expect(result.current[0]).toBeNull();

    act(() => {
      window.history.pushState(null, '', '/local_tunet_casa?kamera=camera.garten');
      window.dispatchEvent(new CustomEvent('location-changed'));
    });
    expect(result.current[0]).toMatchObject({ kamera: 'camera.garten', clip: null });
  });
});

describe('Kamera-Fenster mit Clip', () => {
  const entity = { state: 'idle', attributes: { friendly_name: 'Haustür' } };

  it('shows the clip first and switches to the live stream', () => {
    const { container } = render(<CameraModal show onClose={() => {}} entityId="camera.haustuer" entity={entity} clipUrl="/api/frigate/notifications/ev1/clip.mp4" />);
    expect(container.querySelector('video').getAttribute('src')).toContain('/api/frigate/notifications/ev1/clip.mp4');
    fireEvent.click(screen.getByRole('button', { name: /Stream/ }));
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByTestId('feed')).toBeTruthy();
  });

  it('explains a clip that is not ready yet', () => {
    const { container } = render(<CameraModal show onClose={() => {}} entityId="camera.haustuer" entity={entity} clipUrl="/clip.mp4" />);
    fireEvent.error(container.querySelector('video'));
    expect(screen.getByText(/noch nicht fertig/)).toBeTruthy();
  });

  it('has no clip view without a clip', () => {
    render(<CameraModal show onClose={() => {}} entityId="camera.haustuer" entity={entity} />);
    expect(screen.queryByRole('button', { name: /^Clip$/ })).toBeNull();
    expect(screen.getByTestId('feed')).toBeTruthy();
  });
});
