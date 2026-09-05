import { createHash } from 'node:crypto';

const clean=value=>String(value||'').trim();

export function ownerMailerAuth(env=process.env){
  const serviceRole=clean(env.SUPABASE_SERVICE_ROLE_KEY);
  if(!serviceRole||serviceRole.startsWith('sb_publishable_'))return '';
  return createHash('sha256').update(`${serviceRole}:dabbir-owner-otp-mailer-v1`).digest('hex');
}
