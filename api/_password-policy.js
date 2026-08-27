const COMMON_PASSWORDS = new Set([
  'password','password1','password123','qwerty','qwerty123','123456','12345678','123456789',
  '1234567890','111111','000000','abc123','letmein','welcome','admin','administrator','iloveyou',
  'dabbir','dabbir123','dubai123','uae12345'
]);

const SIMPLE_SEQUENCES = [
  '0123456789','9876543210','abcdefghijklmnopqrstuvwxyz','zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiop','poiuytrewq','asdfghjkl','lkjhgfdsa','zxcvbnm','mnbvcxz'
];

const fold = value => String(value || '').normalize('NFKC').toLowerCase();

function characterClassCount(password) {
  return [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)]
    .filter(Boolean).length;
}

function hasSimpleSequence(password) {
  const value = fold(password).replace(/\s+/g, '');
  if (value.length < 6) return false;
  return SIMPLE_SEQUENCES.some(sequence => {
    for (let size = 6; size <= Math.min(sequence.length, value.length); size += 1) {
      for (let start = 0; start + size <= sequence.length; start += 1) {
        if (value.includes(sequence.slice(start, start + size))) return true;
      }
    }
    return false;
  });
}

export function passwordPolicy(password, { email = '' } = {}) {
  const raw = String(password || '');
  const normalized = fold(raw);
  const compact = normalized.replace(/\s+/g, '');
  const emailLocal = fold(email).split('@')[0].replace(/[^a-z0-9]/g, '');
  const reasons = [];

  if (raw.length < 12) reasons.push('TOO_SHORT');
  if (raw.length > 256) reasons.push('TOO_LONG');
  if (COMMON_PASSWORDS.has(compact)) reasons.push('COMMON_PASSWORD');
  if (/^(.)\1{7,}$/u.test(raw)) reasons.push('REPEATED_CHARACTER');
  if (hasSimpleSequence(raw)) reasons.push('SIMPLE_SEQUENCE');
  if (emailLocal.length >= 4 && compact.includes(emailLocal)) reasons.push('CONTAINS_EMAIL_IDENTITY');

  // Long passphrases remain valid without forcing arbitrary symbol rules.
  // Shorter passwords need diversity across letters, numbers and symbols.
  if (raw.length < 20 && characterClassCount(raw) < 3) reasons.push('LOW_CHARACTER_DIVERSITY');

  return {
    valid: reasons.length === 0,
    reasons,
    minimum_length: 12,
    passphrase_length: 20,
  };
}

export function isStrongPassword(password, options) {
  return passwordPolicy(password, options).valid;
}
