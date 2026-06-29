import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const match = context.url.pathname.match(/^\/join\/([^/]+)\/?$/);
  if (match && match[1] !== '_') {
    const token = match[1];
    return context.redirect(`/join?token=${encodeURIComponent(token)}`);
  }

  return next();
});
