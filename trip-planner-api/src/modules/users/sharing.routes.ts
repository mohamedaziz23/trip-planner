import { Router, type Request } from 'express';
import QRCode from 'qrcode';
import { ApiError, send } from '../../lib/http';
import { randomToken } from '../../lib/tokens';
import { requireAuth } from '../../middleware/auth';
import { loadTripForMember, loadTripForOwner } from '../../middleware/tripAccess';
import { PlaceModel } from '../places/place.model';
import { TripModel, type TripDoc } from '../trips/trip.model';
import { TRIP_POPULATE } from '../trips/trip.service';
import { exportFilename, renderTripPdf, shareUrl } from './export.service';

/**
 * Module 1 advanced feature: itinerary export as PDF and public share links.
 *
 *   GET    /trips/:tripId/export   member      PDF of the itinerary (budget and costs included)
 *   GET    /trips/:tripId/share    owner       current link + QR code (404 when disabled)
 *   POST   /trips/:tripId/share    owner       enable the link (idempotent)
 *   DELETE /trips/:tripId/share    owner       revoke the link: the old URL stops working
 *   GET    /share/:token           public      read-only itinerary
 *   GET    /share/:token/export    public      read-only PDF (no budget, no costs)
 */
const router = Router();

const TOKEN_FORMAT = /^[a-f0-9]{64}$/;

async function shareInfo(trip: TripDoc) {
  const url = shareUrl(trip)!;
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#115e59', light: '#ffffff' } });
  return { shareToken: trip.shareToken!, url, qrSvg };
}

async function loadSharedTrip(req: Request) {
  const token = String(req.params.token ?? '');
  const trip = TOKEN_FORMAT.test(token) ? await TripModel.findOne({ shareToken: token }) : null;
  if (!trip) throw ApiError.notFound('This share link is invalid or was revoked');
  return trip;
}

function sendPdf(res: Parameters<typeof send>[0], trip: TripDoc) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(trip)}"`);
  res.setHeader('Cache-Control', 'no-store');
}

// ---------------------------------------------------------------- authenticated (trip members)
router.get('/trips/:tripId/export', requireAuth, async (req, res) => {
  const trip = await loadTripForMember(req);
  const places = await PlaceModel.find({ trip: trip._id }).sort({ day: 1, order: 1 }).lean();
  await trip.populate(TRIP_POPULATE);
  sendPdf(res, trip);
  await renderTripPdf(trip, places, res, { publicView: false });
});

router.get('/trips/:tripId/share', requireAuth, async (req, res) => {
  const trip = await loadTripForOwner(req);
  if (!trip.shareToken) throw ApiError.notFound('The share link is not enabled for this trip');
  send(res, await shareInfo(trip));
});

router.post('/trips/:tripId/share', requireAuth, async (req, res) => {
  const trip = await loadTripForOwner(req);
  if (!trip.shareToken) {
    trip.shareToken = randomToken(); // 32 random bytes, unique index (sparse)
    await trip.save();
  }
  send(res, await shareInfo(trip), 'Share link enabled');
});

router.delete('/trips/:tripId/share', requireAuth, async (req, res) => {
  const trip = await loadTripForOwner(req);
  trip.shareToken = undefined;
  await trip.save();
  send(res, null, 'Share link revoked');
});

// ---------------------------------------------------------------- public (anyone with the link)
router.get('/share/:token', async (req, res) => {
  const trip = await loadSharedTrip(req);
  await trip.populate({ path: 'members.user', select: 'name' });
  const places = await PlaceModel.find({ trip: trip._id })
    .select('name lat lng address category day startTime durationMin notes order')
    .sort({ day: 1, order: 1 })
    .lean();
  // only what the read-only page needs: no budget, expenses, journal or emails
  send(res, {
    trip: {
      _id: trip._id,
      title: trip.title,
      destination: trip.destination,
      country: trip.country,
      startDate: trip.startDate,
      endDate: trip.endDate,
      coverUrl: trip.coverUrl,
      members: trip.members.map((m) => ({ name: (m.user as unknown as { name?: string })?.name ?? 'Traveller' })),
    },
    places,
  });
});

router.get('/share/:token/export', async (req, res) => {
  const trip = await loadSharedTrip(req);
  await trip.populate({ path: 'members.user', select: 'name' });
  const places = await PlaceModel.find({ trip: trip._id }).sort({ day: 1, order: 1 }).lean();
  sendPdf(res, trip);
  await renderTripPdf(trip, places, res, { publicView: true });
});

export default router;
