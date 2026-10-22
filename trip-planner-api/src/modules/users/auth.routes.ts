import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env';
import { ApiError, created, send } from '../../lib/http';
import { body } from '../../lib/validate';
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  consumeRefreshToken,
  issueRefreshToken,
  randomToken,
  setRefreshCookie,
  sha256,
  signAccessToken,
  verifyRefreshToken,
} from '../../lib/tokens';
import { sendMail } from '../../lib/mailer';
import { authLimiter } from '../../middleware/rateLimit';
import { UserModel, type UserDoc } from './user.model';

export const BCRYPT_COST = 12;
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);

const router = Router();

async function startSession(res: Parameters<typeof send>[0], user: UserDoc) {
  const refresh = issueRefreshToken(user);
  user.lastLoginAt = new Date();
  await user.save();
  setRefreshCookie(res, refresh);
  return { user: user.toJSON(), accessToken: signAccessToken(user) };
}

router.post('/register', authLimiter, async (req, res) => {
  const input = body(
    req,
    z.object({
      name: z.string().trim().min(2).max(80),
      email: z.email().toLowerCase(),
      password: passwordSchema,
      baseCurrency: z.string().length(3).toUpperCase().optional(),
      homeCountry: z.string().length(2).toUpperCase().optional(),
    }),
  );
  if (await UserModel.exists({ email: input.email })) {
    throw new ApiError(409, 'An account already exists with this email', [
      { path: 'email', message: 'Email already registered' },
    ]);
  }
  const user = new UserModel({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
    baseCurrency: input.baseCurrency ?? 'EUR',
    homeCountry: input.homeCountry ?? null,
  });
  created(res, await startSession(res, user), 'Account created');
});

router.post('/login', authLimiter, async (req, res) => {
  const input = body(req, z.object({ email: z.email().toLowerCase(), password: z.string().min(1) }));
  const user = await UserModel.findOne({ email: input.email });
  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !valid) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
  send(res, await startSession(res, user), 'Logged in');
});

/** Exchanges the refresh cookie for a new access token; the refresh token is rotated on use. */
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw ApiError.unauthorized('No refresh token');
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Refresh token invalid or expired');
  }
  const user = await UserModel.findById(payload.sub);
  if (!user || !user.isActive) {
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Account not found or deactivated');
  }
  if (consumeRefreshToken(user, payload.jti) === 'reuse') {
    // a revoked token was presented: assume theft and end every session
    user.refreshTokens = [] as unknown as typeof user.refreshTokens;
    await user.save();
    clearRefreshCookie(res);
    throw ApiError.unauthorized('Refresh token reuse detected - please log in again');
  }
  const refresh = issueRefreshToken(user);
  await user.save();
  setRefreshCookie(res, refresh);
  send(res, { user: user.toJSON(), accessToken: signAccessToken(user) }, 'Token refreshed');
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await UserModel.updateOne({ _id: payload.sub }, { $pull: { refreshTokens: { jti: payload.jti } } });
    } catch {
      // already invalid
    }
  }
  clearRefreshCookie(res);
  send(res, null, 'Logged out');
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = body(req, z.object({ email: z.email().toLowerCase() }));
  const user = await UserModel.findOne({ email, isActive: true });
  if (user) {
    const token = randomToken();
    user.resetTokenHash = sha256(token);
    user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const link = `${env.clientOrigin}/reset-password?token=${token}`;
    await sendMail(
      user.email,
      'Reset your Trip Planner password',
      `Hello ${user.name},\n\nUse this link within one hour to choose a new password:\n${link}\n\nIf you did not ask for this, ignore this email.`,
    );
  }
  // same answer whether or not the account exists
  send(res, null, 'If an account exists for this email, a reset link has been sent');
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const input = body(req, z.object({ token: z.string().min(32), password: passwordSchema }));
  const user = await UserModel.findOne({
    resetTokenHash: sha256(input.token),
    resetTokenExpires: { $gt: new Date() },
  });
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');
  user.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  user.resetTokenHash = null;
  user.resetTokenExpires = null;
  user.refreshTokens = [] as unknown as typeof user.refreshTokens; // sign out everywhere
  await user.save();
  send(res, null, 'Password updated, you can now log in');
});

export default router;
