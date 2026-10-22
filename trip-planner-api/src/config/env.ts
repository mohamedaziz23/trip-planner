import 'dotenv/config';

function str(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable ${name}`);
}

const nodeEnv = str('NODE_ENV', 'development');

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: Number(str('PORT', '4000')),
  apiPublicUrl: str('API_PUBLIC_URL', 'http://localhost:4000'),
  clientOrigin: str('CLIENT_ORIGIN', 'http://localhost:3000'),
  mongoUri: str('MONGODB_URI', 'mongodb://127.0.0.1:27017/trip-planner?directConnection=true'),
  jwtAccessSecret: str('JWT_ACCESS_SECRET', nodeEnv === 'production' ? undefined : 'dev-access-secret'),
  jwtRefreshSecret: str('JWT_REFRESH_SECRET', nodeEnv === 'production' ? undefined : 'dev-refresh-secret'),
  accessTokenTtl: str('ACCESS_TOKEN_TTL', '15m'),
  refreshTokenTtlDays: Number(str('REFRESH_TOKEN_TTL_DAYS', '7')),
  cookieSecure: str('COOKIE_SECURE', 'false') === 'true',
  cookieSameSite: str('COOKIE_SAMESITE', 'lax') as 'lax' | 'strict' | 'none',
  cloudinary: {
    cloudName: str('CLOUDINARY_CLOUD_NAME', ''),
    apiKey: str('CLOUDINARY_API_KEY', ''),
    apiSecret: str('CLOUDINARY_API_SECRET', ''),
  },
  vapid: {
    publicKey: str('VAPID_PUBLIC_KEY', ''),
    privateKey: str('VAPID_PRIVATE_KEY', ''),
    subject: str('VAPID_SUBJECT', 'mailto:admin@tripplanner.local'),
  },
  smtp: {
    host: str('SMTP_HOST', ''),
    port: Number(str('SMTP_PORT', '587')),
    user: str('SMTP_USER', ''),
    pass: str('SMTP_PASS', ''),
    from: str('MAIL_FROM', 'Trip Planner <no-reply@tripplanner.local>'),
  },
  ratesApiUrl: str('RATES_API_URL', 'https://open.er-api.com/v6/latest'),
  osrmUrl: str('OSRM_URL', 'https://router.project-osrm.org'),
  nominatimUrl: str('NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
};
