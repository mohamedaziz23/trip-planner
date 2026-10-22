import webpush from 'web-push';
import { env } from '../config/env';
import { UserModel } from '../modules/users/user.model';

export const pushEnabled = Boolean(env.vapid.publicKey && env.vapid.privateKey);

if (pushEnabled) {
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
} else {
  console.warn('[push] VAPID keys missing - run `npm run vapid` and fill .env to enable Web Push');
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** Sends a notification to every subscription of the given users; prunes dead subscriptions. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!pushEnabled || userIds.length === 0) return;
  const users = await UserModel.find({ _id: { $in: userIds }, isActive: true }).select('pushSubscriptions');
  await Promise.all(
    users.flatMap((user) =>
      user.pushSubscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.keys!.p256dh, auth: sub.keys!.auth } },
            JSON.stringify(payload),
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await UserModel.updateOne({ _id: user._id }, { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } });
          } else {
            console.warn('[push] send failed', status ?? err);
          }
        }
      }),
    ),
  );
}
