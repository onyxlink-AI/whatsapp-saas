export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return 'Sin teléfono';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length <= 4) return `***${digits.slice(-2)}`;
  const countryLength = digits.length > 10 ? digits.length - 9 : 0;
  const country = countryLength > 0 ? `+${digits.slice(0, countryLength)} ` : '';
  return `${country}*** *** ${digits.slice(-3)}`;
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.trim().split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function messagePreview(body: string | null, maxLength = 140): string | null {
  if (!body) return null;
  const compact = body.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}
