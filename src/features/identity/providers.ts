export function identityProviders() {
  return [
    { id: 'google', name: 'Google', configured: Boolean(process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim()) },
    { id: 'microsoft-entra-id', name: 'Microsoft', configured: Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim() && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET?.trim()) },
  ];
}
