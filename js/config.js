// Site configuration: edit these without touching the rest of the code.
export const CONFIG = {
  // Where every "Join the free beta" button points. Leave empty to send people to the contact
  // page with "Snapplyze" pre-selected; set it to the live sign-up URL when it's public.
  snapplyzeUrl: '',
  // Contact form endpoint. `/api/contact` is the bundled Vercel function (api/contact.js, Resend).
  // It receives a JSON POST: { name, email, phone, company, message, needs[], lang, page }.
  // If it's missing or fails, the form falls back to opening the visitor's email app.
  formEndpoint: '/api/contact',
  contactEmail: 'info@auroratech.me',
};
