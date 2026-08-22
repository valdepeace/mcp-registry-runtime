# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

- **Do NOT** open a public GitHub issue
- Email: [INSERT CONTACT EMAIL]
- Include a description of the vulnerability and steps to reproduce

We will acknowledge your report within 48 hours and work on a fix.

## Production Deployment

Before deploying in production, you **MUST**:

1. **Change `JWT_SECRET`** — Set a strong, unique secret in your `.env` file. The app will refuse to start in production mode with the default value.

2. **Change `ADMIN_PASSWORD`** — Set a strong password for the admin user.

3. **Use HTTPS** — Never expose the API over plain HTTP in production.

4. **Restrict CORS** — Set `CORS_ORIGINS` to your specific domain(s) instead of `*`.

5. **Secure the database** — Ensure the SQLite database file is not publicly accessible.

## Default Credentials

The development defaults are:
- Username: `admin`
- Password: `admin`

These are **insecure** and must be changed before any production use.

## Environment Variables

See `.env.example` files in each app directory for the full list of configuration options. Never commit your `.env` file to version control.
