# Security

Stem Shovel is a hosted service (www.stem-shovel.com) whose code is public
under the Apache License 2.0. Security reports about the code or the service
are welcome.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's
private vulnerability reporting on this repository ("Report a vulnerability"
under the Security tab), or email security@lightningjar.com.

Include what you found, how to reproduce it, and what you think the impact
is. You will get an acknowledgement within three working days and a fix or a
plan within thirty; we credit reporters in the changelog unless they prefer
not to be named.

## Scope

In scope: this repository's code, the production service and its data
handling (accounts, private projects and songs, uploaded files, email).
Out of scope: denial of service, reports from automated scanners with no
demonstrated impact, and issues in third-party services (Vercel, Turso,
Resend, Better Auth) that are not caused by how this code uses them —
report those to the vendor.

Please test only against accounts and data you own; the service has real
users' work in it.

## What is already in place

docs/security.md describes the security model: tenant scoping of every
query, invitation-only sign-up, optional two-factor authentication,
private projects with signed file access, rate limits, and the response
headers and content security policy.
