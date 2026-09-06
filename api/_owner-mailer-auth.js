import { createHash } from 'node:crypto';

export function ownerMailerAuth(resendKey){
  const key=String(resendKey||'').trim();
  if(key.length<24)return '';
  return createHash('sha256').update(`${key}:dabbir-owner-otp-mailer-v2`).digest('hex');
}
