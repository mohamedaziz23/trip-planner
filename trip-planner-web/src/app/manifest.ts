import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Trip Planner',
    short_name: 'Trips',
    description: 'Plan a trip together: itinerary, budget, packing list and journal - even offline.',
    start_url: '/trips',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#0f766e',
    categories: ['travel', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My trips', url: '/trips', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Forum', url: '/forum', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
